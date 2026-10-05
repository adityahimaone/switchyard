import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

/**
 * Pixel comparison for the design loop's reference check.
 *
 * Playwright's `toHaveScreenshot` resolves every name into its
 * own snapshot directory — relative `..` escapes and absolute
 * paths are both flattened into labels — so a committed export
 * in design/ cannot be used as a baseline directly. This module
 * does the comparison explicitly instead: decode both PNGs, diff
 * them, and report a ratio. One source of truth, no baseline
 * copy to drift.
 */

export interface DesignSurface {
  /** Stable name; also the export's file name. */
  name: string;
  /** Route to render, e.g. "/board/f8-saas". */
  route: string;
  /** Export path relative to design/. */
  export: string;
  /** Viewport the mock was designed at. The export must be scale 1. */
  viewport?: { width: number; height: number };
  /** Theme the mock depicts; the app is toggled to match. */
  theme?: "light" | "dark";
}

/** A surface whose export and render disagree on dimensions. */
export class DesignSizeMismatch extends Error {
  readonly actual: string;
  readonly expected: string;

  constructor(actual: string, expected: string) {
    super(
      `design export is ${expected}, the rendered surface is ${actual}. ` +
        `The export must be scale 1 (--export-scale 1) and the manifest ` +
        `viewport must match the canvas the mock was designed at.`,
    );
    this.name = "DesignSizeMismatch";
    this.actual = actual;
    this.expected = expected;
  }
}

export interface DesignCompareResult {
  diffPixels: number;
  totalPixels: number;
  /** diffPixels / totalPixels — the number the budget is checked against. */
  ratio: number;
  /** PNG-encoded diff image, written as the failure artifact. */
  diffImage: Buffer;
}

/** Perceptual per-pixel threshold (0–1) before a pixel counts as different. */
const PIXEL_THRESHOLD = 0.1;

export function compareScreenshots(
  actualPng: Buffer,
  expectedPng: Buffer,
): DesignCompareResult {
  const actual = PNG.sync.read(actualPng);
  const expected = PNG.sync.read(expectedPng);
  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new DesignSizeMismatch(
      `${actual.width}x${actual.height}`,
      `${expected.width}x${expected.height}`,
    );
  }
  const { width, height } = actual;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(actual.data, expected.data, diff.data, width, height, {
    threshold: PIXEL_THRESHOLD,
  });
  const totalPixels = width * height;
  return {
    diffPixels,
    totalPixels,
    ratio: diffPixels / totalPixels,
    diffImage: PNG.sync.write(diff),
  };
}

/** Reads and validates the manifest; a missing or malformed file means no surfaces. */
export function loadSurfaces(manifest: string): DesignSurface[] {
  let raw: unknown;
  try {
    raw = JSON.parse(manifest);
  } catch {
    return [];
  }
  const surfaces = (raw as { surfaces?: unknown })?.surfaces;
  return Array.isArray(surfaces) ? (surfaces as DesignSurface[]) : [];
}
