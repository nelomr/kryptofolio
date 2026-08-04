import { describe, expect, it } from "vitest";
import { SOURCE_PROFILE_IDS } from "@kryptofolio/shared-types";

import { detectSourceProfile } from "../domain/services/sourceProfile/detectSourceProfile";
import { SOURCE_FORMAT_PROFILES } from "../domain/services/sourceProfile/profiles";
import { REAL_HEADER_ROWS } from "./fixtures/realHeaderRows";
import type { SourceProfileId } from "@kryptofolio/shared-types";

function requiredOf(id: SourceProfileId): readonly string[] {
  const signature = SOURCE_FORMAT_PROFILES[id].signature;
  return signature.kind === "HEADER_SET" ? signature.required : [];
}

describe("detectSourceProfile, over the real header rows", () => {
  for (const [expectedId, headers] of Object.entries(REAL_HEADER_ROWS)) {
    it(`resolves ${expectedId} from its own export's header row`, () => {
      expect(detectSourceProfile([...headers])).toEqual({
        kind: "RESOLVED",
        profileId: expectedId,
      });
    });
  }

  it("resolves every one of the six real files to a different profile", () => {
    const resolved = Object.values(REAL_HEADER_ROWS).map((headers) => {
      const result = detectSourceProfile([...headers]);
      return result.kind === "RESOLVED" ? result.profileId : result.kind;
    });
    expect(new Set(resolved).size).toBe(resolved.length);
  });
});

describe("detectSourceProfile, when the evidence does not single out one source", () => {
  it("reports every candidate and picks none when two signatures match", () => {
    // A file carrying both Bitunix's and Bitvavo's columns satisfies both signatures: neither
    // profile forbids any of the other's headers, which is what makes this a real tie rather than
    // one the exclusion lists already break.
    const headers = [
      ...requiredOf("bitunix-spot"),
      ...requiredOf("bitvavo-spot"),
    ];

    const result = detectSourceProfile(headers);
    expect(result.kind).toBe("AMBIGUOUS");
    if (result.kind !== "AMBIGUOUS") return;
    expect([...result.candidates].sort()).toEqual(["bitunix-spot", "bitvavo-spot"]);
  });

  it("does not let the order the headers arrive in decide anything", () => {
    const bitunix = [...REAL_HEADER_ROWS["bitunix-spot"]];
    expect(detectSourceProfile(bitunix)).toEqual(
      detectSourceProfile([...bitunix].reverse()),
    );
  });

  it("does not let the order of the profile table decide an ambiguity", () => {
    const ambiguous = [...requiredOf("bitunix-spot"), ...requiredOf("bitvavo-spot")];
    const forwards = detectSourceProfile(ambiguous);
    const backwards = detectSourceProfile([...ambiguous].reverse());
    expect(forwards).toEqual(backwards);
    expect(forwards.kind).toBe("AMBIGUOUS");
  });

  it("reports an unknown header row as unrecognised rather than as a named source", () => {
    expect(detectSourceProfile(["foo", "bar", "baz"])).toEqual({ kind: "UNRECOGNISED" });
    expect(detectSourceProfile([])).toEqual({ kind: "UNRECOGNISED" });
  });

  it("never resolves to the fallback profile, which is reached by absence instead", () => {
    for (const headers of [
      ["foo"],
      [],
      ...Object.values(REAL_HEADER_ROWS).map((h) => [...h]),
    ]) {
      const result = detectSourceProfile(headers);
      if (result.kind === "RESOLVED") expect(result.profileId).not.toBe("generic");
    }
  });

  it("tolerates surrounding whitespace and a changed capitalisation in a header", () => {
    const shouted = REAL_HEADER_ROWS["bitvavo-spot"].map((h) => ` ${h.toUpperCase()} `);
    expect(detectSourceProfile(shouted)).toEqual({
      kind: "RESOLVED",
      profileId: "bitvavo-spot",
    });
  });

  it("only ever names a declared identifier", () => {
    const result = detectSourceProfile([...REAL_HEADER_ROWS["kraken-futures"]]);
    if (result.kind !== "RESOLVED") throw new Error("expected a resolution");
    expect(SOURCE_PROFILE_IDS).toContain(result.profileId);
  });
});

describe("a forbidden header is what stops a catch-all winning", () => {
  it("declines Tangem for a six-column file that also carries Kraken's txid", () => {
    const result = detectSourceProfile(["Date", "Type", "Asset", "Amount", "Fee", "Notes", "txid"]);
    expect(result.kind).toBe("UNRECOGNISED");
  });

  it("still resolves Tangem for the real six-column file", () => {
    expect(detectSourceProfile([...REAL_HEADER_ROWS.tangem])).toEqual({
      kind: "RESOLVED",
      profileId: "tangem",
    });
  });
});
