/** True when built as a claude.ai Artifact, where printing, downloads and service workers are blocked. */
export const IS_ARTIFACT = import.meta.env.VITE_TARGET === 'artifact';
