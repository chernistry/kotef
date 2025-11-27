import { diff_match_patch } from 'diff-match-patch';

export interface DmpHunk {
    expected: string;
    replacement: string;
}

/**
 * Applies a list of hunks to the original text using diff-match-patch.
 * This provides a robust fallback for fuzzy patching when strict diff fails.
 * 
 * @param original The original file content
 * @param hunks The list of hunks (expected -> replacement) to apply
 * @returns The patched content
 * @throws Error if any patch fails to apply or is ambiguous
 */
export function applyDmpHunks(original: string, hunks: DmpHunk[]): string {
    const dmp = new diff_match_patch();

    // Configure DMP for safety
    dmp.Match_Threshold = 0.5; // Default is 0.5, strictness of match
    dmp.Patch_DeleteThreshold = 0.5; // Strictness of delete

    let current = original;

    for (const hunk of hunks) {
        // 1. Compute the patch from expected to replacement
        // We use patch_make(text1, text2) -> patch list
        // Here text1 is the "expected" block (what we think is in the file)
        // and text2 is the "replacement" block (what we want it to become).
        // However, patch_make usually takes the FULL text. 
        // But we only have the hunk. 
        // If we just diff the hunk strings, DMP will create a patch that says "replace this string with that string".
        // When applied to the full file, DMP will search for "this string" and replace it.

        const patches = dmp.patch_make(hunk.expected, hunk.replacement);

        // 2. Apply the patch to the current full content
        // patch_apply returns [text, results[]]
        const [result, success] = dmp.patch_apply(patches, current);

        // 3. Verify success
        // success is an array of booleans, one for each patch in the list.
        // Even a simple string replacement might generate multiple micro-patches if there are commonalities.
        // We require ALL parts of the patch to succeed.
        if (success.some(s => !s)) {
            // Construct a helpful error message
            // We can try to find where it failed or why
            throw new Error(`DMP patch application failed for hunk: "${hunk.expected.slice(0, 50)}..." -> "${hunk.replacement.slice(0, 50)}..."`);
        }

        current = result;
    }

    return current;
}
