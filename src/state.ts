// Shared mutable state — imported as live bindings by main.ts and dv5.ts
export let currentUser: any = null;
export let proDB: any[] = [];
export let lbDB: any[] = [];
export let allDocs: Record<string, any> = {};
export let allTimelines: Record<string, any> = {};
export let allChecklists: Record<string, any> = {};
export let employers: any[] = [];
export let jobOrders: any[] = [];
export let proStages: string[] = ['INTERVIEW','OFFER LETTER','MEDICAL & ATTESTATION','WORK PERMIT','VISA','TICKET BOOKED','TRAVELLED'];
// General Jobs default pipeline (the "General"/fallback country). Aligned with
// LB_PIPELINE_STAGES in main.ts so there is one canonical default, not several.
export let lbStages: string[] = ['SUBMITTED','PROFILE SENT','SELECTED','PASSPORT APPLIED','VISA PROCESSING','TRAVELLED','REFUND PENDING','REFUND COMPLETE'];
// Single source of truth for per-country General Jobs pipelines, keyed by the
// exact country name. Empty until a country's pipeline is edited/seeded; the
// resolver falls back to the built-in preset, then lbStages.
export let generalWorkflows: Record<string, string[]> = {};

// Setter functions — callers can't reassign live bindings directly
export const setCurrentUser    = (v: any): void => { currentUser    = v; };
export const setProDB          = (v: any[]): void => { proDB          = v; };
export const setLbDB           = (v: any[]): void => { lbDB           = v; };
export const setAllDocs        = (v: Record<string, any>): void => { allDocs        = v; };
export const setAllTimelines   = (v: Record<string, any>): void => { allTimelines   = v; };
export const setAllChecklists  = (v: Record<string, any>): void => { allChecklists  = v; };
export const setEmployers      = (v: any[]): void => { employers      = v; };
export const setJobOrders      = (v: any[]): void => { jobOrders      = v; };
export const setProStages      = (v: string[]): void => { proStages      = v; };
export const setLbStages       = (v: string[]): void => { lbStages       = v; };
export const setGeneralWorkflows = (v: Record<string, string[]>): void => { generalWorkflows = v; };
