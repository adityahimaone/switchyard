import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import {
  DesignSizeMismatch,
  compareScreenshots,
  loadSurfaces,
} from "./design-compare";

/** A solid-colour PNG of the given size, as a buffer. */
function png(width: number, height: number, rgba: [number, number, number, number] = [16, 20, 32, 255]): Buffer {
  const image = new PNG({ width, height });
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = rgba[0];
    image.data[i + 1] = rgba[1];
    image.data[i + 2] = rgba[2];
    image.data[i + 3] = rgba[3];
  }
  return PNG.sync.write(image);
}

describe("compareScreenshots", () => {
  it("an identical render has a zero ratio", () => {
    const a = png(4, 4);
    const result = compareScreenshots(a, png(4, 4));
    expect(result.diffPixels).toBe(0);
    expect(result.ratio).toBe(0);
    expect(result.totalPixels).toBe(16);
  });

  it("a single changed pixel reports its share of the frame", () => {
    const actual = PNG.sync.read(png(4, 4));
    actual.data[0] = 255; // one channel of one pixel
    const result = compareScreenshots(PNG.sync.write(actual), png(4, 4));
    expect(result.diffPixels).toBe(1);
    expect(result.ratio).toBeCloseTo(1 / 16, 5);
  });

  it("a mismatched size is its own error, not a pixel budget", () => {
    expect(() => compareScreenshots(png(4, 4), png(8, 4))).toThrow(DesignSizeMismatch);
    try {
      compareScreenshots(png(4, 4), png(8, 4));
    } catch (err) {
      expect((err as DesignSizeMismatch).message).toMatch(/4x4/);
      expect((err as DesignSizeMismatch).message).toMatch(/8x4/);
      expect((err as DesignSizeMismatch).message).toMatch(/scale 1/);
    }
  });

  it("a diff image is produced for the failure artifact", () => {
    const result = compareScreenshots(png(2, 2, [0, 0, 0, 255]), png(2, 2, [255, 255, 255, 255]));
    expect(result.ratio).toBe(1);
    // A PNG that decodes back to the same dimensions proves the
    // artifact is a well-formed image, not an empty buffer.
    const decoded = PNG.sync.read(result.diffImage);
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(2);
  });
});

describe("loadSurfaces", () => {
  it("reads the surfaces array", () => {
    const surfaces = loadSurfaces(JSON.stringify({ surfaces: [{ name: "board", route: "/", export: "exports/board.png" }] }));
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0].name).toBe("board");
  });

  it("a missing or malformed manifest means no surfaces", () => {
    expect(loadSurfaces("not json")).toEqual([]);
    expect(loadSurfaces(JSON.stringify({}))).toEqual([]);
    expect(loadSurfaces(JSON.stringify({ surfaces: "nope" }))).toEqual([]);
  });
});
