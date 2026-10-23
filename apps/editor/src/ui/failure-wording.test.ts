import { describe, expect, it } from "vitest"

import {
  explainExportFailure,
  fileProblem,
  storageProblem,
  technicalDetail,
  type ExportFailureStage,
} from "./failure-wording"

describe("technicalDetail", () => {
  it("names a DOMException and keeps its message", () => {
    expect(
      technicalDetail(new DOMException("A requested file was not found.", "NotFoundError"))
    ).toBe("NotFoundError: A requested file was not found.")
  })

  it("does not repeat a plain Error's name, nor a name already in the message", () => {
    expect(technicalDetail(new Error("disk full"))).toBe("disk full")
    const named = new Error("EngineFatalError: already named")
    named.name = "EngineFatalError"
    expect(technicalDetail(named)).toBe("EngineFatalError: already named")
  })

  it("never says [object Object], whatever was thrown", () => {
    const thrown: unknown[] = [
      {},
      { code: 7 },
      new Event("error"),
      Object.create(null),
      null,
      undefined,
      "",
      42,
      (() => {
        const circular: Record<string, unknown> = {}
        circular.self = circular
        return circular
      })(),
    ]
    for (const value of thrown) {
      const detail = technicalDetail(value)
      expect(detail).not.toMatch(/\[object /)
      expect(detail.length).toBeGreaterThan(0)
    }
    expect(technicalDetail({ code: 7 })).toBe('{"code":7}')
    expect(technicalDetail(new Event("error"))).toBe('Event "error"')
  })

  it("follows a cause, since the outer message is often only a wrapper", () => {
    const error = new Error("The Project stored as p-1 could not be opened.", {
      cause: new TypeError("migrateProject: a Project must be an object"),
    })
    expect(technicalDetail(error)).toBe(
      "The Project stored as p-1 could not be opened.\nCaused by: TypeError: migrateProject: a Project must be an object"
    )
  })
})

describe("plain sentences", () => {
  it("say what is wrong with a file by the DOMException's name", () => {
    expect(fileProblem(new DOMException("", "NotAllowedError"))).toMatch(/permission/)
    expect(fileProblem(new DOMException("", "NotFoundError"))).toMatch(/no longer where it was/)
    expect(fileProblem(new DOMException("", "NotReadableError"))).toMatch(/another program/)
    expect(fileProblem(new Error("?"))).toBe("It could not be read.")
  })

  it("say what is wrong with storage, with an action when there is one", () => {
    expect(storageProblem(new DOMException("", "QuotaExceededError"))).toMatch(
      /run out of space.*Free up some disk space/
    )
    expect(storageProblem(new Error("?"))).toMatch(/did not accept/)
  })
})

describe("explainExportFailure", () => {
  const stages: ExportFailureStage[] = ["choosing", "opening", "mixing", "running", "committing"]

  it("offers Reload, not Try again, when the engine is what stopped", () => {
    const words = explainExportFailure(
      "running",
      "EngineFatalError: The Cutroom engine stopped: x",
      "a.mp4"
    )
    expect(words.action).toBe("reload")
    expect(words.title).toMatch(/engine stopped/)
  })

  it("offers another name when the destination is full or not writable", () => {
    expect(
      explainExportFailure("committing", "QuotaExceededError: disk full", "a.mp4")
    ).toMatchObject({
      title: "There was not enough space to save the file.",
      action: "choose-another-name",
    })
    expect(explainExportFailure("running", "NotAllowedError: denied", "a.mp4")).toMatchObject({
      title: "Cutroom was not allowed to write to a.mp4.",
      action: "choose-another-name",
    })
  })

  it("names a Source going Offline in the product's terms, not the engine's", () => {
    const words = explainExportFailure(
      "running",
      "the media of Clip c-1 went offline or was relinked during the export, so …",
      "a.mp4"
    )
    expect(words.title).toBe("A Source went Offline or was relinked while the export ran.")
    expect(`${words.title} ${words.explanation}`).not.toMatch(/media/i)
  })

  it("gives every stage a plain title of its own and never the raw reason", () => {
    for (const stage of stages) {
      const words = explainExportFailure(stage, "Error: x7f3 opaque", "a.mp4")
      expect(words.title).not.toContain("x7f3")
      expect(words.explanation).not.toContain("x7f3")
      expect(words.title).toMatch(/\.$/)
    }
    expect(explainExportFailure("opening", "x", "a.mp4").title).toBe(
      "a.mp4 could not be opened for writing."
    )
    expect(explainExportFailure("mixing", "x", "a.mp4").explanation).toMatch(/without the sound/)
  })
})
