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
export let lbStages: string[] = ['DOCS SUBMITTED','PROFILE SENT','SELECTED','PASSPORT APPLIED','VISA PROCESSING','TRAVELLED','REFUND PENDING','REFUND COMPLETE'];

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
