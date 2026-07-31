import { type LaTeXLayoutConfig } from "./schema.js";
/**
 * Pure injector: apply layout knobs into a raw TeX string.
 * Validates config via Zod; does not compile.
 */
export declare function injectLaTeXConfig(rawTex: string, config: LaTeXLayoutConfig): string;
/** Linear interpolation helpers for the binary-search tightness axis. */
export declare function lerpNumber(a: number, b: number, t: number): number;
export declare function lerpInch(a: string, b: string, t: number): string;
export declare function lerpPt(a: string, b: string, t: number): string;
export declare function configAtTightness(t: number, loose: LaTeXLayoutConfig, tight: LaTeXLayoutConfig): LaTeXLayoutConfig;
//# sourceMappingURL=injectLaTeXConfig.d.ts.map