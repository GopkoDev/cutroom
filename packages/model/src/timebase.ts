// The single place in Cutroom where a Frame becomes anything else (Principle II, R7, ADR 0002).
//
// Everything on the Timeline is an integer Frame index in the Project's Timebase, which is an
// exact ratio — 30000/1001, never 29.97. Seconds and sample indices exist only at the edges where
// we hand a number to a decoder, to Web Audio or to the muxer, and every one of those crossings
// happens here. Code elsewhere that multiplies by a rate is a defect, not a shortcut.
//
// Three properties this module is built to hold:
//
//   - Arithmetic stays in exact integers. Every conversion is a rational computed with BigInt and
//     collapsed to a Number once, at the end. No intermediate float, so no intermediate error.
//   - Conversions are computed from the absolute Frame, never accumulated frame by frame. The
//     error against the true boundary is therefore bounded by the single final rounding and does
//     not grow with the Frame number, however long the Timeline gets.
//   - The functions are total. Input outside the domain throws and says what was wrong, because a
//     plausible-looking number returned from a time conversion is the kind of defect that surfaces
//     as drifting audio an hour into an Export rather than as a stack trace.

/**
 * A Project's Timebase: Frames per second as an exact ratio, e.g. `{ numerator: 30000,
 * denominator: 1001 }`. Both parts are positive integers. Not a frame rate and not a float —
 * see CONTEXT.md.
 */
export interface Timebase {
  readonly numerator: number
  readonly denominator: number
}

/**
 * An exact ratio of seconds. Used for time in a **Source's own** timescale — how long a Source is,
 * and where in it a Clip begins. That is the one exception Principle II names (constitution 1.1.0,
 * ADR 0002): a Source's media time is an address inside media we did not author, so it is never
 * renumbered into the Project's Frames and never flattened to a float.
 */
export interface Rational {
  readonly numerator: number
  readonly denominator: number
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)

/** Renders a rejected value for an error message without throwing on its own account. */
function show(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value)
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value)
    } catch {
      return Object.prototype.toString.call(value)
    }
  }
  return String(value)
}

/**
 * Validates a `{ numerator, denominator }` argument. `minNumerator` is 1 for a Timebase (a rate of
 * zero Frames per second converts nothing) and 0 for a time in seconds (a Source can legitimately
 * be addressed at its very beginning, and a Source can be zero seconds long).
 */
function assertRatio(
  value: unknown,
  where: string,
  name: string,
  minNumerator: 0 | 1
): asserts value is Rational {
  if (typeof value !== "object" || value === null) {
    throw new RangeError(
      `${where}: ${name} must be a { numerator, denominator }, got ${show(value)}`
    )
  }
  const { numerator, denominator } = value as Record<string, unknown>
  if (!Number.isSafeInteger(numerator) || (numerator as number) < minNumerator) {
    const bound = minNumerator === 1 ? "positive" : "non-negative"
    throw new RangeError(
      `${where}: ${name} numerator must be a ${bound} safe integer, got ${show(numerator)}`
    )
  }
  if (!Number.isSafeInteger(denominator) || (denominator as number) <= 0) {
    throw new RangeError(
      `${where}: ${name} denominator must be a positive safe integer, got ${show(denominator)}`
    )
  }
}

/**
 * A Frame is an integer index into the Project's Timebase and there is no position between two
 * Frames, nor any before the first one — so a fractional or negative Frame is a caller's mistake,
 * not a value to be silently floored.
 */
function assertFrame(frame: unknown, where: string): asserts frame is number {
  if (!Number.isSafeInteger(frame) || (frame as number) < 0) {
    throw new RangeError(`${where}: frame must be a non-negative safe integer, got ${show(frame)}`)
  }
}

/** Collapses an exact result to a Number, refusing to return one that has lost integer precision. */
function toSafeNumber(value: bigint, where: string, what: string): number {
  if (value > MAX_SAFE) {
    throw new RangeError(
      `${where}: ${what} is ${value}, beyond Number.MAX_SAFE_INTEGER (${MAX_SAFE}) — the value cannot be represented exactly`
    )
  }
  return Number(value)
}

/**
 * `numerator / denominator` to the nearest integer, an exact half going up. Both arguments are
 * non-negative and `denominator` is positive, which the callers have already established.
 * floor(a/b + 1/2) = floor((2a + b) / 2b), and BigInt division truncates, which for non-negative
 * operands is floor.
 */
function roundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator)
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a
  let y = b
  while (y !== 0n) {
    const next = x % y
    x = y
    y = next
  }
  return x
}

/**
 * The real time at which a Frame begins, in seconds. This is a boundary crossing — decoders and
 * Web Audio take floats — so it is the one place a float is the answer rather than a mistake.
 *
 * The division is done in exact integers and split into whole seconds plus a remainder, so the
 * only rounding is the final `remainder / numerator`. Multiplying `frame * denominator` in doubles
 * would start losing integer precision long before the Timeline is long enough for anyone to
 * notice it had.
 */
export function frameToSeconds(timebase: Timebase, frame: number): number {
  assertRatio(timebase, "frameToSeconds", "Timebase", 1)
  assertFrame(frame, "frameToSeconds")

  const rate = BigInt(timebase.numerator)
  const scaled = BigInt(frame) * BigInt(timebase.denominator)
  return Number(scaled / rate) + Number(scaled % rate) / Number(rate)
}

/**
 * The Frame that a time in seconds falls on.
 *
 * ROUNDING RULE — this is the only rounding of a time value in Cutroom (Principle II), so it is
 * stated once, here: **nearest Frame, with an exact half rounding up** (towards the later Frame).
 * Frame n therefore owns the half-open interval [n − ½, n + ½) measured in Frames: every instant
 * belongs to exactly one Frame, no interval is claimed by two Frames, and the rule is the same on
 * both sides of zero-crossing questions like "which Frame is this decoded timestamp". `Math.round`
 * is exactly this rule.
 *
 * Negative seconds are rejected rather than rounded: there is no Frame before the first one, and a
 * negative time reaching here means something upstream produced a position it should not have.
 */
export function secondsToFrame(timebase: Timebase, seconds: number): number {
  assertRatio(timebase, "secondsToFrame", "Timebase", 1)
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError(
      `secondsToFrame: seconds must be a finite number >= 0, got ${show(seconds)}`
    )
  }

  // `seconds` arrives as a float from outside, so this is float arithmetic by necessity; it is
  // ordered to keep the error to a single operation — scale first, divide once, never form the
  // rate `numerator / denominator` as a float of its own.
  const frame = Math.round((seconds * timebase.numerator) / timebase.denominator)
  if (!Number.isSafeInteger(frame)) {
    throw new RangeError(
      `secondsToFrame: ${seconds} seconds is Frame ${frame}, beyond the range of exact integers`
    )
  }
  return frame
}

/**
 * The audio sample index at which a Frame begins, for a stream of the given sample rate.
 *
 * Computed from the absolute Frame, never accumulated. At 48 kHz in a 30000/1001 Timebase a Frame
 * boundary falls at 1601.6 samples, i.e. between two samples, and it does so forever — there is no
 * Frame at which the two grids line back up. Rounding that single exact rational to the nearest
 * sample keeps the error at no more than half a sample for every Frame in the Timeline, whether it
 * is Frame 1 or Frame 1,000,000. Adding a per-Frame sample count instead would make the same error
 * cumulative: 1602 samples per Frame is right to within 0.4 samples once, and 7193 samples — about
 * 150 ms — out by the ten-minute mark. That is the drift ADR 0002 exists to prevent.
 *
 * The tie rule is the one `secondsToFrame` documents: nearest, an exact half going up.
 */
export function frameToSampleIndex(timebase: Timebase, sampleRate: number, frame: number): number {
  assertRatio(timebase, "frameToSampleIndex", "Timebase", 1)
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError(
      `frameToSampleIndex: sampleRate must be a positive safe integer, got ${show(sampleRate)}`
    )
  }
  assertFrame(frame, "frameToSampleIndex")

  const samples = BigInt(frame) * BigInt(timebase.denominator) * BigInt(sampleRate)
  const index = roundHalfUp(samples, BigInt(timebase.numerator))
  return toSafeNumber(index, "frameToSampleIndex", "sample index")
}

/**
 * How many Frames a duration covers: the count of Frames whose **start** falls inside the media.
 * The duration is an exact ratio of seconds — a Source's own length, which is not ours to renumber
 * (ADR 0002) — so the conversion into the Project's Timebase is exact until the last step.
 *
 * That last step rounds **up**, and the reason is an off-by-one worth stating because the first
 * implementation got it wrong. A count of `n` means the Frame indices `0 … n − 1`; index `n` is the
 * exclusive end and is never displayed. A Source of exactly 10.000 s in a 30000/1001 Timebase
 * covers 299.7 Frame-lengths. Truncating gives 299, i.e. indices 0…298 — but index 299 starts at
 * 9.9766 s, comfortably inside the file and perfectly decodable, so truncation throws away a real
 * Frame and 33 ms of picture. Rounding up gives 300, i.e. indices 0…299, every one of which has
 * media behind it, and index 300 — the one that would start at 10.010 s, past the end — is exactly
 * the exclusive end that no one asks to decode.
 *
 * When the division is exact the ceiling changes nothing: 10.000 s at a 30/1 Timebase is 300 Frame
 * lengths and 300 Frames, indices 0…299.
 *
 * For a video Source, the container usually states how many Frames it actually holds, and that is
 * a fact where this is an inference — prefer it at import when it is available. This function is
 * for everything else: audio, and expressing a Source's length in *our* Timebase when it was
 * authored in another.
 */
export function framesForDuration(timebase: Timebase, duration: Rational): number {
  assertRatio(timebase, "framesForDuration", "Timebase", 1)
  assertRatio(duration, "framesForDuration", "duration", 0)

  const covered = BigInt(duration.numerator) * BigInt(timebase.numerator)
  const perFrame = BigInt(duration.denominator) * BigInt(timebase.denominator)
  // Ceiling by integer division: (a + b − 1) / b, valid because both are non-negative and BigInt
  // division truncates towards zero.
  const frames = (covered + perFrame - 1n) / perFrame
  return toSafeNumber(frames, "framesForDuration", "Frame count")
}

/**
 * Where a Project Frame lands inside a Source, in the Source's own timescale, as an exact ratio of
 * seconds:
 *
 *     sourceTime = sourceInPoint + frame / timebase
 *
 * This is the function that makes a Source whose Timebase differs from the Project's someone
 * else's problem exactly once (R7). Note what it does *not* take: the Source Timebase. It does not
 * need it. A Source's time is seconds in its own timescale — an address, not a position on a grid
 * we own — so mapping into it needs no rate arithmetic about the Source at all, and returning an
 * exact rational rather than a float means the caller inherits no error to compound. `packages/
 * engine` seeks with this value; whether the Source's own Frames are 24 to the second or 30000 to
 * the 1001 is the decoder's business and never becomes arithmetic of ours.
 *
 * The result is in lowest terms with a positive denominator, so two ways of naming the same instant
 * compare equal.
 */
export function frameToSourceTime(
  timebase: Timebase,
  sourceInPoint: Rational,
  frame: number
): Rational {
  assertRatio(timebase, "frameToSourceTime", "Timebase", 1)
  assertRatio(sourceInPoint, "frameToSourceTime", "sourceInPoint", 0)
  assertFrame(frame, "frameToSourceTime")

  const rate = BigInt(timebase.numerator)
  const perFrame = BigInt(timebase.denominator)
  const inPointNumerator = BigInt(sourceInPoint.numerator)
  const inPointDenominator = BigInt(sourceInPoint.denominator)

  const numerator = inPointNumerator * rate + BigInt(frame) * perFrame * inPointDenominator
  const denominator = inPointDenominator * rate
  // gcd(0, d) is d, so a Frame at the very start of a Source normalises to 0/1 rather than 0/d.
  const divisor = gcd(numerator, denominator)

  return {
    numerator: toSafeNumber(numerator / divisor, "frameToSourceTime", "Source time numerator"),
    denominator: toSafeNumber(
      denominator / divisor,
      "frameToSourceTime",
      "Source time denominator"
    ),
  }
}

/**
 * The Source time `duration` before `time`, or the Source's very beginning if that is earlier —
 * exact, in lowest terms. Both are Source time (Principle II's exception), so this is subtraction
 * of two exact ratios and nothing else.
 *
 * What it is for: a decoder started cold at `time` does not produce `time` correctly. An AAC
 * decoder's first frame is half an overlap with silence, so sound decoded from the very packet a
 * seek lands in begins with a fade-in that is not in the file; starting a little earlier and
 * discarding the run-up is the remedy, and this is how far back "a little" is measured.
 */
export function sourceTimeBefore(time: Rational, duration: Rational): Rational {
  assertRatio(time, "sourceTimeBefore", "time", 0)
  assertRatio(duration, "sourceTimeBefore", "duration", 0)

  const numerator =
    BigInt(time.numerator) * BigInt(duration.denominator) -
    BigInt(duration.numerator) * BigInt(time.denominator)
  if (numerator <= 0n) return { numerator: 0, denominator: 1 }
  const denominator = BigInt(time.denominator) * BigInt(duration.denominator)
  const divisor = gcd(numerator, denominator)
  return {
    numerator: toSafeNumber(numerator / divisor, "sourceTimeBefore", "Source time numerator"),
    denominator: toSafeNumber(denominator / divisor, "sourceTimeBefore", "Source time denominator"),
  }
}

// ---------------------------------------------------------------------------------------------
// A Source's own clock: ticks
// ---------------------------------------------------------------------------------------------
//
// A container stores time as integers on a clock of its own — an MP4 track's timescale, say 30000
// or 90000 ticks to the second. Those ticks are not Frames and never become Frames of the Project:
// they are how a Source's own time (Principle II's exception) arrives, and the three functions
// below are the only arithmetic done on them. `packages/engine` reads the clock and the tick
// counts out of the file; what they mean as a duration or a Source Timebase is decided here.

/** Validates a clock's resolution: a positive whole number of ticks to the second. */
function assertTicksPerSecond(value: unknown, where: string): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new RangeError(
      `${where}: ticksPerSecond must be a positive safe integer, got ${show(value)}`
    )
  }
}

/**
 * Recovers the integer tick count that a time in seconds stands for, on a clock of
 * `ticksPerSecond`.
 *
 * This is for a float that a demuxer computed as `ticks / ticksPerSecond` from an integer the
 * container stored, so the integer is there to be recovered exactly: the rounding absorbs only the
 * last-bit error of that one division and involves no rate. It is nevertheless a rounding of a time
 * value, so it lives here and uses the module's one tie rule — nearest, an exact half going up
 * (towards the later tick), which is `Math.round`.
 *
 * Unlike a Frame, a tick count may be negative: containers legitimately place a packet before
 * zero (an MP4 edit list shifting B-frame pre-roll, for instance), and the caller measures spans
 * between such packets. Only a non-finite input, or one whose tick count is beyond exact integers,
 * is rejected.
 */
export function secondsToTicks(ticksPerSecond: number, seconds: number): number {
  assertTicksPerSecond(ticksPerSecond, "secondsToTicks")
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) {
    throw new RangeError(`secondsToTicks: seconds must be a finite number, got ${show(seconds)}`)
  }

  const ticks = Math.round(seconds * ticksPerSecond)
  if (!Number.isSafeInteger(ticks)) {
    throw new RangeError(
      `secondsToTicks: ${seconds} seconds is ${ticks} ticks, beyond the range of exact integers`
    )
  }
  // `Math.round(-0.5)` is −0; a tick count has no sign of zero.
  return ticks + 0
}

/**
 * A count of ticks on a clock of `ticksPerSecond`, as an exact ratio of seconds in lowest terms —
 * how long a Source is, in its own timescale. 899 899 ticks of a 30000 clock is 899899/30000 s;
 * 300 300 ticks of a 90000 clock is 1001/300 s. Zero ticks is 0/1.
 */
export function ticksToSeconds(ticksPerSecond: number, ticks: number): Rational {
  assertTicksPerSecond(ticksPerSecond, "ticksToSeconds")
  if (!Number.isSafeInteger(ticks) || ticks < 0) {
    throw new RangeError(
      `ticksToSeconds: ticks must be a non-negative safe integer, got ${show(ticks)}`
    )
  }

  const numerator = BigInt(ticks)
  const denominator = BigInt(ticksPerSecond)
  const divisor = gcd(numerator, denominator)
  return { numerator: Number(numerator / divisor), denominator: Number(denominator / divisor) }
}

/**
 * The tick on a clock of `ticksPerSecond` that an exact Source time falls on: nearest, an exact
 * half going up — the module's one tie rule.
 *
 * `secondsToTicks` recovers a tick from a demuxer's float; this is the same question asked of a
 * time that is already exact, such as a Clip's `sourceInPoint`, so it is answered in integers with
 * no float anywhere. Its use is audio: a decoded stream's samples lie on a clock of its sample rate,
 * and where a Clip's in-point lands on that clock is what lines a Source's samples up with the
 * Timeline's (`frameToSampleIndex`). 1001/30000 s on a 48 000 clock is 1601.6, so sample 1602.
 */
export function sourceTimeToTicks(ticksPerSecond: number, time: Rational): number {
  assertTicksPerSecond(ticksPerSecond, "sourceTimeToTicks")
  assertRatio(time, "sourceTimeToTicks", "time", 0)

  const ticks = roundHalfUp(
    BigInt(time.numerator) * BigInt(ticksPerSecond),
    BigInt(time.denominator)
  )
  return toSafeNumber(ticks, "sourceTimeToTicks", "tick count")
}

/**
 * The Timebase that `frames` Frames spanning `spanTicks` ticks of a `ticksPerSecond` clock imply:
 *
 *     timebase = frames × ticksPerSecond / spanTicks      (Frames per second, in lowest terms)
 *
 * This is how a Source Timebase is measured, since no container states one: count Frames over a
 * span of the Source's own clock. 120 Frames over 120 120 ticks of a 30000 clock and over 360 360
 * ticks of a 90000 clock are both exactly 30000/1001 — the clock's resolution cancels out, which is
 * why the result must be reduced rather than reported as it was measured.
 *
 * The product is formed in exact integers, so a large clock cannot overflow it on the way to a
 * reduced result that fits; only a reduced Timebase whose parts are themselves beyond exact
 * integers is refused.
 */
export function timebaseFromTicks(
  ticksPerSecond: number,
  frames: number,
  spanTicks: number
): Timebase {
  assertTicksPerSecond(ticksPerSecond, "timebaseFromTicks")
  if (!Number.isSafeInteger(frames) || frames <= 0) {
    throw new RangeError(
      `timebaseFromTicks: frames must be a positive safe integer, got ${show(frames)}`
    )
  }
  if (!Number.isSafeInteger(spanTicks) || spanTicks <= 0) {
    throw new RangeError(
      `timebaseFromTicks: spanTicks must be a positive safe integer, got ${show(spanTicks)}`
    )
  }

  const numerator = BigInt(frames) * BigInt(ticksPerSecond)
  const denominator = BigInt(spanTicks)
  const divisor = gcd(numerator, denominator)
  return {
    numerator: toSafeNumber(numerator / divisor, "timebaseFromTicks", "Timebase numerator"),
    denominator: toSafeNumber(denominator / divisor, "timebaseFromTicks", "Timebase denominator"),
  }
}

// ---------------------------------------------------------------------------------------------
// Timecode
// ---------------------------------------------------------------------------------------------

/**
 * A Frame as a person reads it: the wall-clock hour, minute and second in which it begins, and how
 * many Frames into that second it is.
 */
export interface Timecode {
  readonly hours: number
  readonly minutes: number
  /** 0 … 59. */
  readonly seconds: number
  /** Frames since the start of `seconds` — the first Frame starting at or after it is 0. */
  readonly frames: number
}

/**
 * The timecode of a Frame: where it begins on the clock, as `hours : minutes : seconds`, and its
 * offset in Frames from the first Frame that begins in that second.
 *
 * **Wall-clock, not SMPTE.** The seconds are the real time at which the Frame begins. At an integer
 * Timebase (25, 30) this is identical to SMPTE non-drop timecode. At 30000/1001 the two part
 * company: non-drop timecode pretends there are exactly 30 Frames to the second and falls 3.6 s
 * behind the clock every hour, and drop-frame timecode repairs that with a skipping rule defined
 * only for 29.97 and 59.94. Neither is what the rest of the product shows — a Source's duration is
 * real seconds, and so is what an exported file reports in a player — so the timecode is the
 * clock, and a second at 30000/1001 simply holds 30 or 29 Frames as the arithmetic falls. `frames`
 * is therefore always less than the number of Frames that begin inside its second.
 *
 * Both steps are exact integer division: the second is floor(frame / timebase), and the first
 * Frame of that second is ceil(second × timebase) — the same count of Frames-starting-before-it
 * that `framesForDuration` gives, so the two can never disagree about where a second begins.
 */
export function frameToTimecode(timebase: Timebase, frame: number): Timecode {
  assertRatio(timebase, "frameToTimecode", "Timebase", 1)
  assertFrame(frame, "frameToTimecode")

  const rate = BigInt(timebase.numerator)
  const perFrame = BigInt(timebase.denominator)
  // Non-negative operands, so BigInt's truncating division is floor, and (a + b − 1) / b is ceil.
  const second = (BigInt(frame) * perFrame) / rate
  const firstFrameOfSecond = (second * rate + perFrame - 1n) / perFrame

  return {
    hours: Number(second / 3600n),
    minutes: Number((second % 3600n) / 60n),
    seconds: Number(second % 60n),
    frames: Number(BigInt(frame) - firstFrameOfSecond),
  }
}

// ---------------------------------------------------------------------------------------------
// Playback on the audio clock (ADR 0008, R3)
// ---------------------------------------------------------------------------------------------
//
// During playback the master clock is an `AudioContext`'s `currentTime`: seconds on the audio
// hardware's clock, a float that Web Audio hands us and takes back. A **playback anchor** pins one
// Frame of the Timeline to one instant on that clock — "Frame 120 begins to sound at 3.25" — and the
// three functions below are the only conversions between the two clocks: which Frame is playing at
// a context time, when a Frame begins, and when a sample of the Timeline's sound begins.
//
// Every answer is measured from the anchor, never accumulated from the previous answer, so the error
// is one float rounding whatever the distance from the anchor — the same property the rest of this
// module holds, and the one that makes drift over a ten-minute playback structurally impossible
// rather than merely small (FR-013).

/**
 * One Frame of the Timeline pinned to one instant of an audio clock: `frame` begins to sound when
 * the clock reads `contextSeconds`. Set when playback starts, and again after a seek.
 */
export interface PlaybackAnchor {
  readonly frame: number
  /** A reading of `AudioContext.currentTime` — seconds on the audio clock, not on the Timeline. */
  readonly contextSeconds: number
}

function assertAnchor(anchor: unknown, where: string): asserts anchor is PlaybackAnchor {
  if (typeof anchor !== "object" || anchor === null) {
    throw new RangeError(
      `${where}: anchor must be a { frame, contextSeconds }, got ${show(anchor)}`
    )
  }
  const { frame, contextSeconds } = anchor as Record<string, unknown>
  assertFrame(frame, `${where} (anchor)`)
  if (typeof contextSeconds !== "number" || !Number.isFinite(contextSeconds)) {
    throw new RangeError(
      `${where}: anchor.contextSeconds must be a finite number, got ${show(contextSeconds)}`
    )
  }
}

/** `anchor + numerator / denominator`, with the division split so its only rounding is the last. */
function anchoredSeconds(anchor: PlaybackAnchor, numerator: bigint, denominator: bigint): number {
  // BigInt division truncates towards zero and `%` takes the dividend's sign, so `q + r / d` is
  // exact for a negative offset as well as a positive one.
  return (
    anchor.contextSeconds +
    Number(numerator / denominator) +
    Number(numerator % denominator) / Number(denominator)
  )
}

/**
 * The context time at which a Frame begins to sound, given where playback was anchored. The Frame
 * may be before the anchor's — the answer is then earlier than `anchor.contextSeconds`.
 */
export function frameToContextTime(
  timebase: Timebase,
  anchor: PlaybackAnchor,
  frame: number
): number {
  assertRatio(timebase, "frameToContextTime", "Timebase", 1)
  assertAnchor(anchor, "frameToContextTime")
  assertFrame(frame, "frameToContextTime")

  const offset = (BigInt(frame) - BigInt(anchor.frame)) * BigInt(timebase.denominator)
  return anchoredSeconds(anchor, offset, BigInt(timebase.numerator))
}

/**
 * The Frame that is playing when the audio clock reads `contextSeconds`: the last Frame that has
 * begun, by `frameToContextTime`. Before the anchor — playback is scheduled a little ahead of the
 * press — it is the anchor's own Frame, which is the one on screen while the sound has yet to start.
 *
 * **Not `secondsToFrame`'s rounding, on purpose.** That rule answers "which Frame does this
 * timestamp belong to", nearest wins. This asks which Frame is on screen, and a Frame is on screen
 * from the instant it begins until the next one begins — the floor, the same question
 * `frameToTimecode` answers for seconds. Rounding to nearest would show every Frame half a Frame
 * before its sound.
 *
 * The estimate from the float is checked against `frameToContextTime`, so the two functions agree
 * by construction: at the very instant `frameToContextTime(f)` returns, this returns `f`.
 */
export function frameAtContextTime(
  timebase: Timebase,
  anchor: PlaybackAnchor,
  contextSeconds: number
): number {
  assertRatio(timebase, "frameAtContextTime", "Timebase", 1)
  assertAnchor(anchor, "frameAtContextTime")
  if (typeof contextSeconds !== "number" || !Number.isFinite(contextSeconds)) {
    throw new RangeError(
      `frameAtContextTime: contextSeconds must be a finite number, got ${show(contextSeconds)}`
    )
  }

  const elapsed = contextSeconds - anchor.contextSeconds
  if (elapsed <= 0) return anchor.frame

  // Scaled first and divided once, as in `secondsToFrame`, then corrected by at most a step either
  // way against the exact boundary.
  let frame = anchor.frame + Math.floor((elapsed * timebase.numerator) / timebase.denominator)
  if (!Number.isSafeInteger(frame)) {
    throw new RangeError(
      `frameAtContextTime: ${elapsed} seconds after the anchor is beyond the range of exact Frames`
    )
  }
  while (frameToContextTime(timebase, anchor, frame + 1) <= contextSeconds) frame += 1
  while (frame > anchor.frame && frameToContextTime(timebase, anchor, frame) > contextSeconds) {
    frame -= 1
  }
  return frame
}

/**
 * The context time at which one sample of the Timeline's sound begins to play.
 *
 * `sample` is an index on the Timeline's own sample grid at `sampleRate` — the grid
 * `frameToSampleIndex` lays down, sample 0 at the start of Frame 0 — which is where the engine
 * places a Clip's decoded sound (`audio-pcm`). So:
 *
 *     contextTime = anchor.contextSeconds + sample / sampleRate − anchor.frame / timebase
 *
 * computed as one exact rational and divided once. Measured against the exact start of the
 * anchor's Frame, not against `frameToSampleIndex` of it, so the only rounding is the final one.
 */
export function timelineSampleToContextTime(
  timebase: Timebase,
  anchor: PlaybackAnchor,
  sampleRate: number,
  sample: number
): number {
  const where = "timelineSampleToContextTime"
  assertRatio(timebase, where, "Timebase", 1)
  assertAnchor(anchor, where)
  if (!Number.isSafeInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError(
      `${where}: sampleRate must be a positive safe integer, got ${show(sampleRate)}`
    )
  }
  if (!Number.isSafeInteger(sample) || sample < 0) {
    throw new RangeError(
      `${where}: sample must be a non-negative safe integer, got ${show(sample)}`
    )
  }

  const rate = BigInt(timebase.numerator)
  const samplesPerSecond = BigInt(sampleRate)
  const numerator =
    BigInt(sample) * rate - BigInt(anchor.frame) * BigInt(timebase.denominator) * samplesPerSecond
  return anchoredSeconds(anchor, numerator, rate * samplesPerSecond)
}
