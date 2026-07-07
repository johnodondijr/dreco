// @ts-nocheck
// Shared mutable state — imported as live bindings by main.ts and dv5.ts
export let currentUser   = null;
export let proDB         = [];
export let lbDB          = [];
export let allDocs       = {};
export let allTimelines  = {};
export let proStages     = ['INTERVIEW','OFFER LETTER','MEDICAL & ATTESTATION','WORK PERMIT','VISA','TICKET BOOKED','TRAVELLED'];
export let lbStages      = ['DOCS SUBMITTED','PROFILE SENT','SELECTED','PASSPORT APPLIED','VISA PROCESSING','TRAVELLED','REFUND PENDING','REFUND COMPLETE'];

// Setter functions — callers can't reassign live bindings directly
export const setCurrentUser  = v => { currentUser  = v; };
export const setProDB        = v => { proDB        = v; };
export const setLbDB         = v => { lbDB         = v; };
export const setAllDocs      = v => { allDocs      = v; };
export const setAllTimelines = v => { allTimelines = v; };
export const setProStages    = v => { proStages    = v; };
export const setLbStages     = v => { lbStages     = v; };
