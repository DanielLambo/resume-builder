import { LaTeXLayoutConfigSchema, } from "./schema.js";
function ensureEnumitem(tex) {
    if (/\\usepackage(?:\[[^\]]*\])?\{enumitem\}/.test(tex)) {
        return tex;
    }
    if (/\\usepackage(?:\[[^\]]*\])?\{geometry\}/.test(tex)) {
        return tex.replace(/(\\usepackage(?:\[[^\]]*\])?\{geometry\})/, "$1\n\\usepackage{enumitem}");
    }
    if (/\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/.test(tex)) {
        return tex.replace(/(\\documentclass(?:\[[^\]]*\])?\{[^}]+\})/, "$1\n\\usepackage{enumitem}");
    }
    return `\\usepackage{enumitem}\n${tex}`;
}
function injectGeometry(tex, config) {
    const geometryLine = `\\usepackage[top=${config.topBottomMargin}, bottom=${config.topBottomMargin}, ` +
        `left=${config.leftRightMargin}, right=${config.leftRightMargin}]{geometry}`;
    if (/\\usepackage\[[^\]]*\]\{geometry\}/.test(tex)) {
        return tex.replace(/\\usepackage\[[^\]]*\]\{geometry\}/, geometryLine);
    }
    if (/\\usepackage\{geometry\}/.test(tex)) {
        return tex.replace(/\\usepackage\{geometry\}/, geometryLine);
    }
    if (/\\usepackage\[empty\]\{fullpage\}/.test(tex)) {
        return tex.replace(/\\usepackage\[empty\]\{fullpage\}/, geometryLine);
    }
    if (/\\documentclass(?:\[[^\]]*\])?\{[^}]+\}/.test(tex)) {
        return tex.replace(/(\\documentclass(?:\[[^\]]*\])?\{[^}]+\})/, `$1\n${geometryLine}`);
    }
    return `${geometryLine}\n${tex}`;
}
function injectLineSpread(tex, config) {
    const line = `\\linespread{${config.lineSpacing}}`;
    if (/\\linespread\{[^}]+\}/.test(tex)) {
        return tex.replace(/\\linespread\{[^}]+\}/, line);
    }
    if (/\\begin\{document\}/.test(tex)) {
        return tex.replace(/\\begin\{document\}/, `${line}\n\\begin{document}`);
    }
    return `${line}\n${tex}`;
}
function injectListSpacing(tex, config) {
    const withEnumitem = ensureEnumitem(tex);
    const setlist = `\\setlist{itemsep=${config.itemSep}, parsep=${config.parsep}}`;
    if (/\\setlist(?:\[[^\]]*\])?\{[^}]*\}/.test(withEnumitem)) {
        return withEnumitem.replace(/\\setlist(?:\[[^\]]*\])?\{[^}]*\}/, setlist);
    }
    if (/\\begin\{document\}/.test(withEnumitem)) {
        return withEnumitem.replace(/\\begin\{document\}/, `${setlist}\n\\begin{document}`);
    }
    return `${setlist}\n${withEnumitem}`;
}
/**
 * Pure injector: apply layout knobs into a raw TeX string.
 * Validates config via Zod; does not compile.
 */
export function injectLaTeXConfig(rawTex, config) {
    const parsed = LaTeXLayoutConfigSchema.parse(config);
    let next = rawTex;
    next = injectGeometry(next, parsed);
    next = injectLineSpread(next, parsed);
    next = injectListSpacing(next, parsed);
    return next;
}
/** Linear interpolation helpers for the binary-search tightness axis. */
export function lerpNumber(a, b, t) {
    return a + (b - a) * t;
}
export function lerpInch(a, b, t) {
    const av = Number.parseFloat(a);
    const bv = Number.parseFloat(b);
    const v = lerpNumber(av, bv, t);
    return `${v.toFixed(2)}in`;
}
export function lerpPt(a, b, t) {
    const av = Number.parseFloat(a);
    const bv = Number.parseFloat(b);
    const v = lerpNumber(av, bv, t);
    const rounded = Math.round(v * 100) / 100;
    return `${rounded}pt`;
}
export function configAtTightness(t, loose, tight) {
    const clamped = Math.min(1, Math.max(0, t));
    return LaTeXLayoutConfigSchema.parse({
        topBottomMargin: lerpInch(loose.topBottomMargin, tight.topBottomMargin, clamped),
        leftRightMargin: lerpInch(loose.leftRightMargin, tight.leftRightMargin, clamped),
        lineSpacing: Number(lerpNumber(loose.lineSpacing, tight.lineSpacing, clamped).toFixed(3)),
        itemSep: lerpPt(loose.itemSep, tight.itemSep, clamped),
        parsep: lerpPt(loose.parsep, tight.parsep, clamped),
    });
}
//# sourceMappingURL=injectLaTeXConfig.js.map