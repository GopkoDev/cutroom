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
