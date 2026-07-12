// Ambient declarations that let dv5.ts type-check without @ts-nocheck.
//
// Dreco wires its modules together through the global object: main.ts does
// `Object.assign(window, { … })` to publish its functions, and dv5.ts calls a
// number of them as bare globals (they resolve via the global scope at runtime).
// These are a genuine dynamic-dispatch boundary, so we type them loosely here
// rather than threading real imports through two 4,800-line bundles. The value
// of dropping @ts-nocheck is that everything *inside* dv5.ts — record field
// access, arithmetic, local logic — is now checked; only this cross-module
// seam stays `any`, and it is the natural place to tighten later.

// The window namespace is Dreco's runtime registry of cross-module functions.
interface Window {
  [key: string]: any;
}

// Cross-module functions published by main.ts and called bare from dv5.ts.
declare var closeModal: any;
declare var switchTab: any;
declare var exportCSV: any;
declare var saveDocsToDB: any;
declare var normalizeProRecord: any;
declare var normalizeLBRecord: any;
declare var openCandidateProfile: any;
declare var renderDocumentsV4: any;
declare var closeCmd: any;
declare var openCmd: any;
declare var cmdSearch: any;
declare var saveDocTicks: any;
declare var renderSettingsPage: any;

// Shared globals referenced (and sometimes assigned) as bare names in dv5.ts.
declare var LOCAL_STORE_KEY: any;
declare var docsTarget: any;
declare var docTicks: any;
declare var lastLBFiltered: any;
declare var lastProFiltered: any;
declare var lbCountryFilter: any;
declare var rows: any;
