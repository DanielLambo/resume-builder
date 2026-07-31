export type SanitizeResult = {
    ok: true;
    content: string;
} | {
    ok: false;
    content: string;
    error: string;
};
export declare function sanitizeLatex(content: string): SanitizeResult;
//# sourceMappingURL=sanitize.d.ts.map