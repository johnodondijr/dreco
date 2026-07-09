// @ts-nocheck
import {
  proDB, lbDB, allDocs, allTimelines, currentUser, proStages, lbStages,
  employers, jobOrders,
  setProDB, setLbDB, setAllDocs, setAllTimelines, setProStages, setLbStages,
} from './state';

// Constants mirrored from main.ts (never change at runtime)
const PRO_PIPELINE_STAGES = ['INTERVIEW','OFFER LETTER','MEDICAL & ATTESTATION','WORK PERMIT','VISA','TICKET BOOKED','TRAVELLED'];
const LB_PIPELINE_STAGES  = ['UNSELECTED','SELECTED','TRAVELLED'];
// Fallback only — overridden by injectDepsToD5 in practice
let DEFAULT_COMPANY = { name: 'Dreco', id: 'dreco-default', generalJobsCountries: ['UAE'] };
let getActiveGeneralCountry, getGeneralWorkflowStages, getLBWorkflowStagesForRecord;
function activeWorkflowStages(type, country = '') {
  const stages = type === 'pro'
    ? proStages
    : (typeof getGeneralWorkflowStages === 'function' ? getGeneralWorkflowStages(country || lbCountryFilter || getActiveGeneralCountry?.()) : lbStages);
  const fallback = type === 'pro' ? PRO_PIPELINE_STAGES : LB_PIPELINE_STAGES;
  const source = Array.isArray(stages) && stages.length ? stages : fallback;
  const canon = type === 'pro' ? canonicalProProcessStage : cleanStageLocal;
  return [...new Set(source.map(canon).filter(Boolean))];
}
const PRO_PROFILE_PROCESS = ['INTERVIEW','OFFER LETTER','MEDICAL & ATTESTATION','WORK PERMIT','VISA','TICKET BOOKED','TRAVELLED'];
const PRO_PROFILE_LABELS = {
  'INTERVIEW': 'Interview',
  'OFFER LETTER': 'Offer Letter',
  'MEDICAL & ATTESTATION': 'Medical & Attestation',
  'WORK PERMIT': 'Work Permit',
  'VISA': 'Visa',
  'TICKET BOOKED': 'Ticket Booked',
  'TRAVELLED': 'Travelled',
};
function cleanStageLocal(value) {
  return String(value || '').trim().toUpperCase();
}
function canonicalProProcessStage(stage) {
  const value = cleanStageLocal(stage);
  const map = {
    'PENDING OFFER': 'OFFER LETTER',
    'PENDING OFFER LETTER': 'OFFER LETTER',
    'PENDING OL': 'OFFER LETTER',
    'OFFER': 'OFFER LETTER',
    'OL': 'OFFER LETTER',
    'MEDICAL': 'MEDICAL & ATTESTATION',
    'MEDICAL ATTESTATION': 'MEDICAL & ATTESTATION',
    'PENDING MOL': 'WORK PERMIT',
    'MOL': 'WORK PERMIT',
    'PENDING VISA': 'VISA',
    'PENDING TRAVEL': 'TICKET BOOKED',
    'READY TO TRAVEL': 'TICKET BOOKED',
    'TRAVEL': 'TICKET BOOKED',
    'TRAVELING': 'TRAVELLED',
    'TRAVELLING': 'TRAVELLED',
    'TRAVELED': 'TRAVELLED',
  };
  return map[value] || value;
}
function hasMilestone(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}
function resolveProProcessStage(row = {}) {
  const raw = row.raw || row;
  const order = Object.fromEntries(PRO_PROFILE_PROCESS.map((stage, index) => [stage, index]));
  const stage = canonicalProProcessStage(row.pipelineStage || raw.stage || row.stage || PRO_PROFILE_PROCESS[0]);

  let milestoneStage = PRO_PROFILE_PROCESS[0];
  if (hasMilestone(raw.interview || row.interview)) milestoneStage = 'INTERVIEW';
  if (hasMilestone(raw.ol || row.ol)) milestoneStage = 'OFFER LETTER';
  if (hasMilestone(raw.medical || row.medical)) milestoneStage = 'MEDICAL & ATTESTATION';
  if (hasMilestone(raw.mol || row.mol)) milestoneStage = 'WORK PERMIT';
  if (hasMilestone(raw.visa || row.visa)) milestoneStage = 'VISA';
  if (stage === 'TICKET BOOKED') milestoneStage = 'TICKET BOOKED';
  if (hasMilestone(raw.travel || row.travel)) milestoneStage = 'TRAVELLED';

  return (order[stage] ?? 0) >= (order[milestoneStage] ?? 0) ? stage : milestoneStage;
}

// Functions injected by main.ts after all declarations are hoisted
let proBalance, proStageValue, lbStageValue, proStageMatches;
let lbRefundPrincipal, lbRefundPaidAmount, lbOwnPassport, lbRefundReturned, lbRefundOutstanding;
let showToast, bindAccountMenuTriggers, fmtDate, getCompanyName;
let proPaidAmount, proPaymentStatus, proPipelineStageValue, lbPipelineStageValue;
let addTimeline, saveTimeline, auditAction, saveLocalStore, getStorageLabel, getCompanyId, dbUpdate, dbDelete, deleteCandidateArtifacts, useCloud;
// Supabase client — named _supabaseDb to avoid shadowing local 'db' variables inside IIFE
let _supabaseDb = null;

// Storage helpers — duplicated from main.ts; dv5.ts cannot import them without
// a circular dependency, and they need no external deps so duplication is safe.
function safeLocalGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeLocalSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage may be blocked */ }
}
function safeSessionGet(key) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function safeSessionSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* storage may be blocked */ }
}
function safeSessionRemove(key) {
  try { sessionStorage.removeItem(key); } catch { /* storage may be blocked */ }
}

/** Called by main.ts immediately after its own function declarations to wire deps. */
export function injectDepsToD5(deps) {
  ({
    proBalance, proStageValue, lbStageValue, proStageMatches,
    lbRefundPrincipal, lbRefundPaidAmount, lbOwnPassport, lbRefundReturned, lbRefundOutstanding,
    showToast, bindAccountMenuTriggers, fmtDate, getCompanyName,
    proPaidAmount, proPaymentStatus, proPipelineStageValue, lbPipelineStageValue,
    addTimeline, saveTimeline, auditAction, saveLocalStore, getStorageLabel, getCompanyId, dbUpdate, dbDelete, deleteCandidateArtifacts, useCloud,
    getActiveGeneralCountry, getGeneralWorkflowStages, getLBWorkflowStagesForRecord,
  } = deps);
  if (deps.DEFAULT_COMPANY) DEFAULT_COMPANY = deps.DEFAULT_COMPANY;
  if (deps.db) _supabaseDb = deps.db;
}

(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────
  const TABS    = ['dash','pipeline','candidates','finance','documents','reports','clients','settings'];
  const ALIASES = {
    pro:'candidates', lb:'candidates',
    kanban:'pipeline', travel:'pipeline', tasks:'pipeline',
    calendar:'pipeline',
    commissions:'finance', repayments:'finance', expenses:'finance',
    team:'settings', help:'settings'
  };
  const TITLES = {
    dash:'Home', pipeline:'Pipeline', candidates:'Candidates',
    tasks:'Tasks', finance:'Finance', documents:'Documents',
    reports:'Reports', clients:'Clients', jobs:'Jobs', settings:'Settings'
  };
  const ICONS = {
    dash:'ti-layout-dashboard', pipeline:'ti-briefcase', candidates:'ti-users',
    tasks:'ti-checkbox', finance:'ti-wallet', documents:'ti-clipboard-text',
    reports:'ti-chart-line', clients:'ti-building-skyscraper', jobs:'ti-briefcase-2', settings:'ti-settings'
  };

  // ── Global job-type tab (Pro / General) ──────────────────
  let jobTypeTab = 'pro';
  let lbCountryFilter = '';
  let profileViewType = null;
  let profileViewId   = null;
  function rerenderPage() {
    const renderers = {
      dash: window.renderDash, pipeline: window.renderPipelinePage,
      candidates: window.renderCandidatesPage, finance: window.renderFinancePage,
      documents: window.renderDocumentsPage, reports: window.renderReportsPage,
      clients: window.renderClientsPage, jobs: window.renderJobsPage,
    };
    for (const [id, fn] of Object.entries(renderers)) {
      const el = document.getElementById(id+'-section');
      if (el && el.style.display !== 'none' && typeof fn === 'function') { fn(); break; }
    }
  }
  window.setJobTypeTab = v => { jobTypeTab = v; candidateStageFilter = ''; lbCountryFilter = ''; rerenderPage(); };
  window.setLbCountry  = v => { lbCountryFilter = v; rerenderPage(); };

  // Shared shadcn-style Pro/General tabs widget
  function jobTypeTabs(suffix='') {
    return `<div class="dv5-job-type-tabs" style="display:flex;align-items:center;gap:0;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;background:#f4f4f5">
      <button class="dv5-jt-tab${jobTypeTab==='pro'?' active':''}" onclick="window.setJobTypeTab('pro')" style="padding:7px 18px;font-size:13px;font-weight:375;border:0;background:${jobTypeTab==='pro'?'#fff':'transparent'};color:${jobTypeTab==='pro'?'#18181b':'#71717a'};cursor:pointer;transition:all .15s;${jobTypeTab==='pro'?'box-shadow:0 1px 3px rgba(0,0,0,.08)':''}">
        <i class="ti ti-briefcase" style="margin-right:5px;font-size:12px"></i>Professional Jobs
      </button>
      <button class="dv5-jt-tab${jobTypeTab==='lb'?' active':''}" onclick="window.setJobTypeTab('lb')" style="padding:7px 18px;font-size:13px;font-weight:375;border:0;background:${jobTypeTab==='lb'?'#fff':'transparent'};color:${jobTypeTab==='lb'?'#18181b':'#71717a'};cursor:pointer;transition:all .15s;${jobTypeTab==='lb'?'box-shadow:0 1px 3px rgba(0,0,0,.08)':''}">
        <i class="ti ti-globe" style="margin-right:5px;font-size:12px"></i>General Jobs
      </button>
    </div>`;
  }

  // Country sub-filter for General Jobs
  function lbCountryBar(rows) {
    const countries = [...new Set(rows.map(r=>r.country).filter(Boolean))].sort();
    if (countries.length < 2) return '';
    return `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:10px">
      <span style="font-size:11px;font-weight:375;color:#71717a;letter-spacing:.04em">DESTINATION:</span>
      <button onclick="window.setLbCountry('')" style="font-size:11px;padding:3px 10px;border-radius:999px;border:1px solid ${!lbCountryFilter?'#1A1C2E':'#E4E1D6'};background:${!lbCountryFilter?'#1A1C2E':'transparent'};color:${!lbCountryFilter?'#fff':'#76746B'};cursor:pointer;font-weight:375">All</button>
      ${countries.map(c=>`<button onclick="window.setLbCountry('${js(c)}')" style="font-size:11px;padding:3px 10px;border-radius:999px;border:1px solid ${lbCountryFilter===c?'#1A1C2E':'#E4E1D6'};background:${lbCountryFilter===c?'#1A1C2E':'transparent'};color:${lbCountryFilter===c?'#fff':'#76746B'};cursor:pointer;font-weight:375">${h(c)}</button>`).join('')}
    </div>`;
  }

  // ── Micro-helpers ─────────────────────────────────────────
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));
  const h = (v='') => String(v ?? '').replace(/[&<>"']/g, m =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
  const js = (v='') => String(v ?? '').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,' ');
  const ini = (name='DR') => String(name||'DR').replace(/[^a-zA-Z ]/g,'').trim()
    .split(/\s+/).filter(Boolean).map(x=>x[0]).join('').slice(0,2).toUpperCase() || 'DR';
  const CANDIDATE_AVATAR_KEY = 'dreco_candidate_avatars_v1';
  const candidateAvatarStoreKey = () => `${CANDIDATE_AVATAR_KEY}_${typeof getCompanyId === 'function' ? getCompanyId() : 'default'}`;
  const readCandidateAvatars = () => {
    try { return JSON.parse(safeLocalGet(candidateAvatarStoreKey()) || '{}') || {}; }
    catch { return {}; }
  };
  const writeCandidateAvatars = avatars => safeLocalSet(candidateAvatarStoreKey(), JSON.stringify(avatars || {}));
  const candidateAvatarKey = (type, id) => `${type || 'candidate'}_${id ?? ''}`;
  const candidateAvatarSrc = (type, id) => {
    if (!type || id === undefined || id === null || id === '') return '';
    return readCandidateAvatars()[candidateAvatarKey(type, id)] || '';
  };
  const candidateAvatar = (name, type='', id='', cls='dv5-avatar') => {
    const src = candidateAvatarSrc(type, id);
    return `<div class="${cls}" data-candidate-avatar="${h(candidateAvatarKey(type, id))}">
      ${src ? `<img src="${h(src)}" alt="${h(name)}">` : h(ini(name))}
    </div>`;
  };
  const money = n => 'KES ' + (Number(n)||0).toLocaleString();
  const moneyUSD = n => '$' + (Number(n)||0).toLocaleString();
  const fmt = v => (typeof fmtDate === 'function' ? fmtDate(v) : (v || '—'));
  const co  = () => (typeof getCompanyName === 'function' ? getCompanyName() : DEFAULT_COMPANY.name);
  const fname = () => String(currentUser?.display || 'John').split(' ')[0] || 'John';
  const avatar = (name, type='', id='') => candidateAvatar(name, type, id, 'dv5-avatar');
  const hasDoc  = r => typeof window.hasDocs === 'function' ? window.hasDocs(r.type, r.id) : false;
  const safeCall = (fn, fallback, ...args) => {
    try { return typeof fn === 'function' ? fn(...args) : fallback; }
    catch (error) { console.warn('Dreco row helper failed', error); return fallback; }
  };
  const balPro  = r => safeCall(proBalance, Math.max((Number(r.commission)||0)-(Number(r.paid)||0),0), r);
  const LB_TRAVELLED_STAGES = new Set(['TRAVELLED','REFUND PENDING','REFUND COMPLETE']);
  const lbHasTravelled = r => LB_TRAVELLED_STAGES.has(String(r.stage||r.travelStatus||r.travel_status||'').toUpperCase());
  const balLB = r => {
    if (safeCall(lbOwnPassport, false, r) || safeCall(lbRefundReturned, false, r)) return 0; // no refund owed
    if (!lbHasTravelled(r)) return 0; // hasn't travelled yet — not a debt
    return safeCall(lbRefundOutstanding, 0, r);
  };

  function stageColor(stage) {
    const s = String(stage||'').toUpperCase();
    // LB pipeline stages
    if (s==='UNSELECTED') return 'gray';
    if (s==='SELECTED') return 'blue';
    // Pro pipeline stages
    if (s==='INTERVIEW' || s==='PENDING OFFER LETTER') return 'gray';
    if (s==='OFFER LETTER') return 'amber';
    if (s==='MEDICAL & ATTESTATION') return 'blue';
    if (s==='WORK PERMIT' || s==='MOL') return 'teal';
    if (s==='VISA') return 'blue';
    if (s==='TICKET BOOKED' || s==='PENDING TRAVEL') return 'orange';
    // Terminal
    if (s==='TRAVELLED'||s==='REFUND COMPLETE') return 'green';
    // Legacy internal stages (fallback)
    if (s.includes('VISA')) return 'blue';
    if (s.includes('MOL') || s.includes('WORK PERMIT')) return 'teal';
    if (s.includes('OFFER')) return 'amber';
    if (s.includes('TRAVEL')||s==='PASSPORT APPLIED') return 'orange';
    if (s==='PROFILE SENT') return 'amber';
    if (s==='REFUND PENDING') return 'red';
    if (s==='DOCS SUBMITTED'||s==='SUBMITTED') return 'gray';
    return 'gray';
  }
  function badge(stage) {
    return `<span class="dv5-badge ${stageColor(stage)}">${h(String(stage||'Not set').replace('PENDING ',''))}</span>`;
  }

  // ── Greeting with time-of-day ─────────────────────────────
  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  // ── Unified candidate row normaliser ──────────────────────
  function allRows() {
    const pro = (Array.isArray(proDB) ? proDB : []).map(r => {
      const paid1=Number(r.paid1)||0;
      const paid2=Number(r.paid2)||0;
      const paid=safeCall(proPaidAmount, Math.max(paid1+paid2, Number(r.paid)||0), r);
      const paymentStatus = typeof proPaymentStatus === 'function'
        ? safeCall(proPaymentStatus, null, r)
        : { expected: Number(r.commission)||0, dueNow: Math.max((Number(r.commission)||0)-paid,0), expectedPercent: 100 };
      const payment = paymentStatus || { expected: Number(r.commission)||0, dueNow: Math.max((Number(r.commission)||0)-paid,0), expectedPercent: 100 };
      const resolvedStage = resolveProProcessStage({
        ...r,
        pipelineStage: safeCall(proPipelineStageValue, canonicalProProcessStage(r.stage || 'INTERVIEW'), r)
      });
      return {
        type:'pro', id:r.id, name:r.name||'—', pp:r.pp||'', phone:r.phone||'',
        position:r.position||'—', company:r.company||'—', country:r.country||'—',
        stage:resolvedStage, pipelineStage:resolvedStage, submitted:r.submitted, interview:r.interview,
        ol:r.ol, medical:r.medical||null, mol:r.mol, visa:r.visa, travel:r.travel,
        owner:r.owner||currentUser?.display||'Team',
        commission:Number(r.commission)||0,
        paid1, paid2, paid,
        paid1_date:r.paid1_date||null,
        paid2_date:r.paid2_date||null,
        balance:balPro(r),
        expected:payment.expected||0,
        dueNow:payment.dueNow||0,
        expectedPercent:payment.expectedPercent||0,
        currency:'KES', raw:r,
        followUp:r.followUp||null,
      };
    });
    const lb = (Array.isArray(lbDB) ? lbDB : []).map(r => {
      const r1Amt = Number(r.r1Amt||r.r1_amt)||0;
      const r2Amt = Number(r.r2Amt||r.r2_amt)||0;
      return {
        type:'lb', id:r.id, name:r.name||'—', pp:r.pp||r.passport||'', phone:r.phone||'',
        position: r.country || 'General Job',
        company:r.company||r.country||'—',
        country:r.country||(typeof getActiveGeneralCountry==='function'?getActiveGeneralCountry():'—')||'—',
        ppStatus:r.ppStatus||r.pp_status||'NOT APPLIED',
        stage:safeCall(lbStageValue, r.stage || r.travelStatus || r.travel_status || 'DOCS SUBMITTED', r),
        pipelineStage:safeCall(lbPipelineStageValue, r.stage || r.travelStatus || r.travel_status || 'DOCS SUBMITTED', r),
        submitted:r.submitted_date||r.submitted||null,
        travelDate:r.travelDate||r.travel_date||null,
        interview:null, mol:null, visa:null,
        travel:r.travelDate||r.travel_date||null,
        own_passport:safeCall(lbOwnPassport, false, r),
        owner:currentUser?.display||'Team',
        commission:safeCall(lbRefundPrincipal, Number(r.toRefund||r.to_refund)||0, r),
        r1Amt, r2Amt,
        r1Date:r.r1Date||r.r1_date||null,
        r2Date:r.r2Date||r.r2_date||null,
        refundPayments:Array.isArray(r.refundPayments)?r.refundPayments:[],
        paid: safeCall(lbRefundPaidAmount, r1Amt + r2Amt, r),
        balance:balLB(r), currency:'USD', raw:r,
        followUp:r.followUp||null,
      };
    });
    return [...pro, ...lb];
  }

  // ── Client aggregation from existing candidate data ───────
  function buildClients() {
    const map = new Map();
    allRows().forEach(r => {
      const name = r.company || 'Unassigned';
      const c = map.get(name) || {
        name, country: r.country||'—', active:0, total:0,
        due:0, paid:0, manager: currentUser?.display||'Team'
      };
      c.total++;
      if (r.stage !== 'TRAVELLED' && r.stage !== 'NOT YET') c.active++;
      c.due   += r.balance;
      c.paid  += r.paid;
      map.set(name, c);
    });
    return [...map.values()].sort((a,b) => b.total - a.total);
  }

  // ── Auto task builder from real data ──────────────────────
  let dismissedAutoTasks = new Set(JSON.parse(localStorage.getItem('dreco_dismissed_tasks')||'[]'));
  let manualTasks = JSON.parse(localStorage.getItem('dreco_manual_tasks')||'[]');
  function saveDismissedTasks() { localStorage.setItem('dreco_dismissed_tasks', JSON.stringify([...dismissedAutoTasks])); }
  function saveManualTasks() { localStorage.setItem('dreco_manual_tasks', JSON.stringify(manualTasks)); }
  window.dismissTask = key => { dismissedAutoTasks.add(key); saveDismissedTasks(); renderTasks(); if(typeof renderDash==='function') renderDash(); };
  window.dismissManualTask = idx => { manualTasks.splice(idx,1); saveManualTasks(); renderTasks(); if(typeof renderDash==='function') renderDash(); };
  window.addManualTask = () => {
    const title = (document.getElementById('new-task-title')?.value||'').trim();
    const due = document.getElementById('new-task-due')?.value||'';
    if (!title) { showToast('Task title required','error'); return; }
    manualTasks.push({title, due, created: new Date().toISOString()});
    saveManualTasks(); renderTasks();
  };

  function buildTasks() {
    const today = new Date(); today.setHours(0,0,0,0);
    const auto = [];
    allRows().forEach(r => {
      const edit = r.type==='pro' ? `editPro(${r.id})` : `editLB(${r.id})`;
      const docs = `openDocs('${r.type}',${JSON.stringify(r.id)},'${js(r.name)}')`;
      const balStr = r.currency==='USD' ? moneyUSD(r.balance) : money(r.balance);
      const meta = `${r.company||r.country||'—'}`;
      auto.push(...[
        r.balance>0                   && {key:`bal_${r.type}_${r.id}`,    priority:'High',   label:'High', title:r.type==='pro'?`Collect commission — ${r.name}`:`Process refund — ${r.name}`, meta:`Balance ${balStr}`, action:edit, icon:'ti-coin'},
        r.type==='pro'&&['WORK PERMIT','MOL'].includes(String(r.stage).toUpperCase()) && {key:`wp_${r.id}`,  priority:'Medium', label:'Med', title:`Work permit follow-up — ${r.name}`, meta, action:edit, icon:'ti-file-check'},
        r.type==='pro'&&String(r.stage).toUpperCase()==='VISA'            && {key:`visa_${r.id}`, priority:'Medium', label:'Med', title:`Visa follow-up — ${r.name}`, meta, action:edit, icon:'ti-id-badge-2'},
        r.type==='pro'&&['TICKET BOOKED','PENDING TRAVEL'].includes(String(r.stage).toUpperCase()) && {key:`tkt_${r.id}`,  priority:'High',   label:'High', title:`Confirm travel — ${r.name}`, meta, action:edit, icon:'ti-plane-departure'},
        r.type==='lb'&&r.stage==='SELECTED'                               && {key:`pp_${r.id}`,   priority:'High',   label:'High', title:`Apply passport — ${r.name}`, meta, action:edit, icon:'ti-passport'},
        r.type==='lb'&&r.stage==='REFUND PENDING'                         && {key:`ref_${r.id}`,  priority:'Medium', label:'Med', title:`Refund pending — ${r.name}`, meta:`${balStr} to refund`, action:edit, icon:'ti-credit-card'},
      ].filter(Boolean));
      if (r.followUp) {
        const fu = new Date(r.followUp); fu.setHours(0,0,0,0);
        if (fu <= today) auto.push({key:`fu_${r.type}_${r.id}`, priority:'High', label:'Overdue', title:`Follow up — ${r.name}`, meta:`Due ${fmt(r.followUp)}`, action:edit, icon:'ti-calendar-event'});
        else if ((fu-today)/86400000 <= 3) auto.push({key:`fu_${r.type}_${r.id}`, priority:'Medium', label:'Soon', title:`Follow up — ${r.name}`, meta:`Due ${fmt(r.followUp)}`, action:edit, icon:'ti-calendar-event'});
      }
    });
    return auto.filter(t => !dismissedAutoTasks.has(t.key));
  }

  // ── Next-action label per candidate ───────────────────────
  function nextAction(r) {
    const s = String(r.pipelineStage || r.stage || '').toUpperCase();
    if (r.type === 'pro' && r.balance > 0) return 'Collect commission';
    if (r.type === 'lb' && r.balance > 0) return 'Process refund';
    if (r.followUp) {
      const today = new Date(); today.setHours(0,0,0,0);
      const due = new Date(r.followUp); due.setHours(0,0,0,0);
      if (!isNaN(due) && due <= today) return 'Follow up today';
    }
    if (r.type === 'pro') {
      if (s === 'INTERVIEW' || s === 'PENDING OFFER LETTER') return 'Run interview';
      if (s === 'OFFER LETTER') return 'Schedule medical & attestation';
      if (s === 'MEDICAL & ATTESTATION') return 'Apply for work permit';
      if (s === 'WORK PERMIT' || s === 'MOL') return 'Follow work permit';
      if (s === 'VISA') return 'Book ticket';
      if (s === 'TICKET BOOKED' || s === 'PENDING TRAVEL') return 'Confirm travel';
    } else {
      if (s === 'SUBMITTED') return 'Send profile';
      if (s === 'PROFILE SENT') return 'Await selection';
      if (s === 'SELECTED') return 'Apply passport';
      if (s === 'PASSPORT APPLIED') return 'Follow passport';
      if (s === 'VISA PROCESSING') return 'Follow visa';
      if (s === 'REFUND PENDING') return 'Complete refund';
    }
    if (s === 'TRAVELLED')    return 'Complete';
    if (s === 'REFUND COMPLETE') return 'Closed';
    return '—';
  }

  // ── Checklist per candidate profile ───────────────────────
  function workflowStatus(r) {
    const openBalance = Number(r.balance) > 0;
    const action = nextAction(r);
    const pct = checklistPct(r);
    let level = 'ok';
    const terminalStages = r.type === 'lb'
      ? ['TRAVELLED','REFUND PENDING','REFUND COMPLETE']
      : ['TRAVELLED'];
    if (openBalance || action.includes('today')) level = 'risk';
    else if (pct < 65 || !terminalStages.includes(String(r.stage||'').toUpperCase())) level = 'watch';
    const reasons = [
      openBalance && (r.type === 'pro' ? 'unpaid commission' : 'refund balance'),
      pct < 65 && `${pct}% complete`,
    ].filter(Boolean);
    return { action, pct, level, reasons };
  }

  function progressMini(r) {
    const status = workflowStatus(r);
    return `<div class="dv5-workflow-mini ${status.level}">
      <div class="dv5-workflow-top"><span>${h(status.action)}</span><strong>${status.pct}%</strong></div>
      <div class="dv5-workflow-bar"><i style="width:${status.pct}%"></i></div>
      ${status.reasons.length ? `<div class="dv5-workflow-reasons">${h(status.reasons.join(' · '))}</div>` : ''}
    </div>`;
  }

  function buildChecklist(r) {
    const s = String(r.pipelineStage || r.stage || '').toUpperCase();
    if (r.type === 'lb') {
      const id = r.id;
      const upl = (typeof window.drecoCandidateDocs === 'function') ? window.drecoCandidateDocs('lb', id) : {};
      return [
        {label:'Passport',          done: !!upl.passport,      action:'docs'},
        {label:'Photo',             done: !!upl.photo,         action:'docs'},
        {label:'CV',                done: !!upl.cv,            action:'docs'},
        {label:'Good Conduct',      done: !!upl.good_conduct,  action:'docs'},
        {label:'Profile Sent',      done: ['PROFILE SENT','SELECTED','PASSPORT APPLIED','VISA PROCESSING','TRAVELLED','REFUND PENDING','REFUND COMPLETE'].includes(s), action:'stage'},
        {label:'Selected',          done: ['SELECTED','PASSPORT APPLIED','VISA PROCESSING','TRAVELLED','REFUND PENDING','REFUND COMPLETE'].includes(s), action:'stage'},
        {label:'Passport Applied',  done: ['PASSPORT APPLIED','VISA PROCESSING','TRAVELLED','REFUND PENDING','REFUND COMPLETE'].includes(s), action:'stage'},
        {label:'Visa Processing',   done: ['VISA PROCESSING','TRAVELLED','REFUND PENDING','REFUND COMPLETE'].includes(s), action:'stage'},
        {label:'Travelled',         done: ['TRAVELLED','REFUND PENDING','REFUND COMPLETE'].includes(s), action:'stage'},
      ];
    }
    const processStage = resolveProProcessStage(r);
    const idx = PRO_PROFILE_PROCESS.indexOf(processStage);
    return [
      {label:'Interview done',              done: !!r.raw?.interview || idx >= PRO_PROFILE_PROCESS.indexOf('INTERVIEW'), action:'stage'},
      {label:'Offer letter received',       done: !!r.raw?.ol || idx >= PRO_PROFILE_PROCESS.indexOf('OFFER LETTER'), action:'stage'},
      {label:'Medical & attestation done',  done: !!r.raw?.medical || idx >= PRO_PROFILE_PROCESS.indexOf('MEDICAL & ATTESTATION'), action:'stage'},
      {label:'Work permit received',        done: !!r.raw?.mol || idx >= PRO_PROFILE_PROCESS.indexOf('WORK PERMIT'), action:'stage'},
      {label:'Visa stamped',                done: !!r.raw?.visa || idx >= PRO_PROFILE_PROCESS.indexOf('VISA'), action:'stage'},
      {label:'Ticket booked',               done: idx >= PRO_PROFILE_PROCESS.indexOf('TICKET BOOKED'), action:'stage'},
      {label:'Candidate travelled',         done: !!r.travel || idx >= PRO_PROFILE_PROCESS.indexOf('TRAVELLED'), action:'stage'},
    ];
  }
  function checklistPct(r) {
    const s = r.type === 'pro' ? resolveProProcessStage(r) : String(r.pipelineStage || r.stage || '').toUpperCase();
    const travelled = r.type === 'lb'
      ? ['TRAVELLED','REFUND PENDING','REFUND COMPLETE'].includes(s)
      : s === 'TRAVELLED';
    if (travelled && r.balance === 0) return 100;
    const cl = buildChecklist(r);
    return Math.round(cl.filter(x=>x.done).length / cl.length * 100);
  }

  function candidateRecordHealth(r) {
    const docs = typeof window.drecoDocCompletion === 'function'
      ? window.drecoDocCompletion(r.type, r.id)
      : { done:0, total:0, pct:0 };
    const checks = buildChecklist(r);
    const missing = [];
    if (!r.name) missing.push('Name');
    if (!r.pp) missing.push('Passport number');
    if (!r.phone) missing.push('Phone');
    if (r.type === 'pro') {
      if (!r.position) missing.push('Job title');
      if (!r.company) missing.push('Client company');
      if (!Number(r.commission)) missing.push('Commission');
    } else {
      if (!r.country) missing.push('Destination');
      if (!Number(r.commission) && !lbOwnPassport?.(r.raw || r)) missing.push('Refund amount');
    }
    if (docs.total && docs.pct < 100) missing.push(`${docs.total - docs.done} document${docs.total - docs.done === 1 ? '' : 's'}`);
    const completedChecklist = checks.filter(x => x.done).length;
    const profileParts = Math.max(1, missing.length + 5);
    const profileScore = Math.max(0, Math.round((profileParts - missing.length) / profileParts * 100));
    const workflowScore = Math.round(completedChecklist / Math.max(checks.length, 1) * 100);
    const financeScore = Number(r.balance) > 0 ? 55 : 100;
    const docScore = docs.total ? docs.pct : 100;
    const score = Math.round((profileScore * .35) + (workflowScore * .3) + (docScore * .2) + (financeScore * .15));
    return {
      score,
      missing: missing.slice(0, 5),
      docs,
      workflowScore,
      financeScore,
      status: score >= 90 ? 'Ready' : score >= 70 ? 'Needs review' : 'Incomplete',
      level: score >= 90 ? 'ok' : score >= 70 ? 'watch' : 'risk',
    };
  }

  // ── Chart helpers ─────────────────────────────────────────
  function buildBarChart(rows) {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: d.toLocaleString('default',{month:'short'}), key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, count:0 });
    }
    rows.forEach(r => {
      if (String(r.stage).toUpperCase() !== 'TRAVELLED') return;
      // use travel date (normalized field); fall back to submitted date
      const rawDate = r.travel || r.travelDate || r.submitted;
      const d = rawDate ? new Date(rawDate) : null; if (!d || isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const m = months.find(x => x.key === key); if (m) m.count++;
    });
    const max = Math.max(...months.map(m => m.count), 1);
    return `<div style="display:flex;align-items:flex-end;gap:6px;height:140px;padding:0 0 4px">
      ${months.map(b => {
        const pct = Math.max(Math.round((b.count/max)*100), b.count>0?6:2);
        return `<div class="dv5-bar-col" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;position:relative">
          <div class="dv5-bar-tip" style="position:absolute;bottom:calc(${pct}% + 10px);left:50%;transform:translateX(-50%);background:#1F2133;color:#DDF56C;font-size:10px;font-weight:500;padding:3px 7px;border-radius:6px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .12s;z-index:10">${b.count} placed</div>
          <div style="width:100%;border-radius:5px 5px 3px 3px;background:linear-gradient(180deg,#5347CE,#6A5CF0);height:${pct}%;min-height:3px;transition:height .4s cubic-bezier(.4,0,.2,1),opacity .12s;cursor:default" onmouseenter="this.previousElementSibling.style.opacity=1;this.style.background='linear-gradient(180deg,#DDF56C,#D7F266)'" onmouseleave="this.previousElementSibling.style.opacity=0;this.style.background='linear-gradient(180deg,#5347CE,#6A5CF0)'"></div>
          <span style="font-size:10px;color:var(--text-3,#999);font-weight:438;white-space:nowrap">${h(b.label)}</span>
        </div>`;
      }).join('')}
    </div>`;
  }

  function buildLineChart(rows: any[], selectedMonth: string) {
    // Auto-detect most recent month with data if the selected month has none
    const getDate = (r: any) => r.raw?.created_at || r.raw?.createdAt || r.raw?.intake || r.submitted || r.raw?.submitted_date || r.raw?.submitted;
    const rowDates = rows.map(r => { const ds = getDate(r); if (!ds) return null; const d = new Date(ds); return isNaN(d as any) ? null : d; }).filter(Boolean) as Date[];
    if (rowDates.length) {
      const selMs = new Date(selectedMonth + '-01').getTime();
      const hasDataInSel = rowDates.some(d => d.getFullYear() === new Date(selMs).getFullYear() && d.getMonth() === new Date(selMs).getMonth());
      if (!hasDataInSel) {
        const latest = rowDates.reduce((a,b) => b > a ? b : a);
        selectedMonth = `${latest.getFullYear()}-${String(latest.getMonth()+1).padStart(2,'0')}`;
      }
    }
    const [selYear, selMonthNum] = selectedMonth.split('-').map(Number);
    const selMonthIdx = selMonthNum - 1; // 0-indexed
    const prevYear = selMonthNum === 1 ? selYear - 1 : selYear;
    const prevMonthIdx = selMonthNum === 1 ? 11 : selMonthIdx - 1;
    const daysInSel = new Date(selYear, selMonthIdx + 1, 0).getDate();
    const daysInPrev = new Date(prevYear, prevMonthIdx + 1, 0).getDate();
    const selWeeks = [0, 0, 0, 0];
    const prevWeeks = [0, 0, 0, 0];
    rows.forEach(r => {
      const ds = r.raw?.created_at || r.raw?.createdAt || r.raw?.intake || r.submitted || r.raw?.submitted_date || r.raw?.submitted;
      if (!ds) return;
      const d = new Date(ds); if (isNaN(d as any)) return;
      const y = d.getFullYear(), m = d.getMonth(), day = d.getDate();
      const wk = day <= 7 ? 0 : day <= 14 ? 1 : day <= 21 ? 2 : 3;
      if (y === selYear && m === selMonthIdx) selWeeks[wk]++;
      else if (y === prevYear && m === prevMonthIdx) prevWeeks[wk]++;
    });
    const inProcess = rows.filter(r=>String(r.stage||'').toUpperCase()!=='TRAVELLED').length;
    const travelledCount = rows.filter(r=>String(r.stage||'').toUpperCase()==='TRAVELLED').length;
    const selTotal = selWeeks.reduce((s,v)=>s+v,0);
    const prevTotal = prevWeeks.reduce((s,v)=>s+v,0);
    const diff = selTotal - prevTotal;
    const selMonthName = new Date(selYear, selMonthIdx, 1).toLocaleString('default',{month:'short'});
    const prevMonthName = new Date(prevYear, prevMonthIdx, 1).toLocaleString('default',{month:'short'});
    const diffLabel = diff===0?`same as ${prevMonthName}`:diff>0?`+${diff} vs ${prevMonthName}`:`${diff} vs ${prevMonthName}`;
    const maxVal = Math.max(...selWeeks, ...prevWeeks, 1);
    const W=680, H=200, PX=24, PY=16;
    const xStep = (W - PX*2) / 3;
    const pts = (data: number[]) => data.map((v,i)=>[PX+i*xStep, H-PY-(v/maxVal)*(H-PY*2)] as [number,number]);
    const curve = (data: number[]) => {
      const p = pts(data);
      let d = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
      for (let i=0;i<p.length-1;i++) { const cx=(p[i][0]+p[i+1][0])/2; d+=` C${cx.toFixed(1)},${p[i][1].toFixed(1)} ${cx.toFixed(1)},${p[i+1][1].toFixed(1)} ${p[i+1][0].toFixed(1)},${p[i+1][1].toFixed(1)}`; }
      return d;
    };
    const twPath = curve(selWeeks), lwPath = curve(prevWeeks);
    const twPts = pts(selWeeks), lwPts = pts(prevWeeks);
    const areaD = `${twPath} L${(PX+3*xStep).toFixed(1)},${H-PY} L${PX},${H-PY} Z`;
    const now = new Date();
    const monthOptions = Array.from({length:12},(_,i)=>{
      const d = new Date(now.getFullYear(), now.getMonth()-11+i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label = d.toLocaleString('default',{month:'long',year:'numeric'});
      return `<option value="${val}"${val===selectedMonth?' selected':''}>${label}</option>`;
    }).join('');
    return `<div class="dv5-line-chart">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px">
        <div class="dv5-line-legend"><span><b></b>${selMonthName} (${selTotal})</span><span><b></b>${prevMonthName} (${prevTotal})</span></div>
        <select class="dv5-select" style="font-size:11px;padding:3px 8px;height:26px;border-radius:7px;min-width:0;width:auto;flex-shrink:0" onchange="window.setCandMovMonth(this.value)">${monthOptions}</select>
      </div>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="dv5LineFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#AE9CF0" stop-opacity=".28"/><stop offset="1" stop-color="#AE9CF0" stop-opacity=".02"/></linearGradient></defs>
        <path d="${areaD}" fill="url(#dv5LineFill)"/>
        <path d="${twPath}" fill="none" stroke="#AE9CF0" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${lwPath}" fill="none" stroke="#1A1C2E" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="6,4"/>
        ${twPts.map(([x,y],i)=>selWeeks[i]>0?`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#AE9CF0" stroke="#fff" stroke-width="2.5"/>`:``).join('')}
        ${lwPts.map(([x,y],i)=>prevWeeks[i]>0?`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#1A1C2E" stroke="#fff" stroke-width="2"/>`:``).join('')}
      </svg>
      <div class="dv5-line-axis"><span>Week 1</span><span>Week 2</span><span>Week 3</span><span>Week 4</span></div>
      <div class="dv5-line-summary"><span>${inProcess} in process</span><span>${travelledCount} travelled</span><span style="font-size:10px;color:#7E7C8C">${diffLabel}</span></div>
    </div>`;
  }

  function ringStat(label, value, color) {
    const pct = Math.max(0, Math.min(100, Number(value)||0));
    return `<div class="dv5-ring-stat">
      <span class="dv5-ring" style="background:conic-gradient(${color} 0 ${pct}%,#EEF0EA ${pct}% 100%)"></span>
      <div><small>${h(label)}</small><strong>${pct}%</strong></div>
    </div>`;
  }

  function buildStageDonut(normRows: any[]) {
    const stageCounts: Record<string,number> = {};
    normRows.forEach(r => { const s=String(r.type==='pro'?resolveProProcessStage(r):(r.pipelineStage||r.stage||'Unknown')).toUpperCase(); stageCounts[s]=(stageCounts[s]||0)+1; });
    const entries = Object.entries(stageCounts).sort((a,b)=>b[1]-a[1]);
    const total = entries.reduce((s,[,n])=>s+n,0) || 1;
    const colorMap: Record<string,string> = {
      'TRAVELLED':'#C9F035','VISA':'#C5C7F0','PENDING VISA':'#EDEDFB',
      'WORK PERMIT':'#AE9CF0','MOL':'#AE9CF0','PENDING MOL':'#EDE8FB','OFFER LETTER':'#F9B3AA',
      'INTERVIEW':'#FCECEA','PENDING OFFER LETTER':'#FCECEA','MEDICAL & ATTESTATION':'#D9D7F1','TICKET BOOKED':'#EDFAA8','PENDING TRAVEL':'#EDFAA8',
      'SELECTED':'#D9D7F1','UNSELECTED':'#F3F3F3',
      'REFUND PENDING':'#FFE2E2','REFUND COMPLETE':'#D1FAE5',
    };
    const fallback = ['#AE9CF0','#F9B3AA','#C5C7F0','#EDFAA8','#C9F035','#D9D7F1','#F3F3F3'];
    const CX=90,CY=90,R=70,RI=46;
    let angle = -Math.PI/2;
    const GAP = entries.length>1 ? 0.05 : 0;
    const paths = entries.map(([s,n],i)=>{
      if(!n) return '';
      const sweep=(n/total)*2*Math.PI;
      const a0=angle+GAP/2, a1=angle+sweep-GAP/2;
      angle+=sweep;
      const ox1=CX+R*Math.cos(a0),oy1=CY+R*Math.sin(a0);
      const ox2=CX+R*Math.cos(a1),oy2=CY+R*Math.sin(a1);
      const ix1=CX+RI*Math.cos(a0),iy1=CY+RI*Math.sin(a0);
      const ix2=CX+RI*Math.cos(a1),iy2=CY+RI*Math.sin(a1);
      const large=sweep>Math.PI?1:0;
      const color=colorMap[s]||fallback[i%fallback.length];
      if(entries.length===1) return `<circle cx="${CX}" cy="${CY}" r="${R}" fill="${color}"/><circle cx="${CX}" cy="${CY}" r="${RI}" fill="#fff"/>`;
      const d=`M${ox1.toFixed(1)},${oy1.toFixed(1)} A${R},${R} 0 ${large},1 ${ox2.toFixed(1)},${oy2.toFixed(1)} L${ix2.toFixed(1)},${iy2.toFixed(1)} A${RI},${RI} 0 ${large},0 ${ix1.toFixed(1)},${iy1.toFixed(1)} Z`;
      return `<path d="${d}" fill="${color}" stroke="#fff" stroke-width="2.5"/>`;
    }).join('');
    const legend = entries.slice(0,7).map(([s,n],i)=>{
      const color=colorMap[s]||fallback[i%fallback.length];
      return `<div style="display:flex;align-items:center;gap:7px;padding:4px 0;border-bottom:1px solid #F3F3F3">
        <span style="width:9px;height:9px;border-radius:2px;background:${color};flex-shrink:0;display:inline-block"></span>
        <span style="font-size:11px;flex:1;color:#18191B;text-transform:uppercase;letter-spacing:.03em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(s)}</span>
        <span style="font-size:11px;font-weight:500;color:#18191B;flex-shrink:0">${n}</span>
        <span style="font-size:10px;color:#999;flex-shrink:0;min-width:26px;text-align:right">${Math.round(n/total*100)}%</span>
      </div>`;
    }).join('');
    return `<div style="display:flex;align-items:center;gap:16px;padding:4px 0">
      <svg width="180" height="180" viewBox="0 0 180 180" style="flex-shrink:0;display:block">
        ${paths}
        <text x="${CX}" y="${CY+3}" text-anchor="middle" dominant-baseline="middle" font-size="28" font-weight="700" fill="#1A1C2E" font-family="inherit">${total}</text>
        <text x="${CX}" y="${CY+21}" text-anchor="middle" font-size="9" fill="#999" font-family="inherit" letter-spacing=".06em">CANDIDATES</text>
      </svg>
      <div style="flex:1;min-width:0">${legend}</div>
    </div>`;
  }

  function buildFinanceDonut(entries: any[], isPro: boolean) {
    const byPos: Record<string,number> = {};
    entries.forEach(e => { const pos = e.r?.position || 'Other'; byPos[pos] = (byPos[pos]||0) + (Number(e.amt)||0); });
    const sorted = Object.entries(byPos).sort((a,b)=>b[1]-a[1]);
    const topN: [string,number][] = sorted.slice(0,6) as any;
    const otherAmt = sorted.slice(6).reduce((s:[number],_:[string,number])=>s+_[1], 0);
    if (otherAmt > 0) topN.push(['Other', otherAmt]);
    if (!topN.length) return `<div style="text-align:center;padding:24px;font-size:12px;color:#9ca3af">No collections data for this period.</div>`;
    const totalAmt = topN.reduce((s,_)=>s+_[1], 0) || 1;
    const colors = ['#AE9CF0','#F9B3AA','#C5C7F0','#C9F035','#EDFAA8','#1A1C2E','#E5E3F8'];
    const CX=130, CY=130, R=118, RI=74;
    let angle = -Math.PI/2;
    const GAP = topN.length > 1 ? 0.04 : 0;
    const paths = topN.map(([,amt],i) => {
      const sweep = (amt/totalAmt)*2*Math.PI;
      const a0=angle+GAP/2, a1=angle+sweep-GAP/2; angle+=sweep;
      const ox1=CX+R*Math.cos(a0),oy1=CY+R*Math.sin(a0);
      const ox2=CX+R*Math.cos(a1),oy2=CY+R*Math.sin(a1);
      const ix1=CX+RI*Math.cos(a0),iy1=CY+RI*Math.sin(a0);
      const ix2=CX+RI*Math.cos(a1),iy2=CY+RI*Math.sin(a1);
      const large=sweep>Math.PI?1:0; const color=colors[i%colors.length];
      if(topN.length===1) return `<circle cx="${CX}" cy="${CY}" r="${R}" fill="${color}"/><circle cx="${CX}" cy="${CY}" r="${RI}" fill="var(--edu-bg,#fff)" />` ;
      return `<path d="M${ox1.toFixed(1)},${oy1.toFixed(1)} A${R},${R} 0 ${large},1 ${ox2.toFixed(1)},${oy2.toFixed(1)} L${ix2.toFixed(1)},${iy2.toFixed(1)} A${RI},${RI} 0 ${large},0 ${ix1.toFixed(1)},${iy1.toFixed(1)} Z" fill="${color}" stroke="var(--edu-bg,#fff)" stroke-width="2.5"/>`;
    }).join('');
    const compact = (n: number) => n>=1e6 ? (n/1e6).toFixed(2).replace(/\.?0+$/,'')+'M' : n>=1e3 ? (n/1e3).toFixed(1).replace(/\.?0+$/,'')+'K' : String(n);
    const centerTotal = isPro ? `KES ${compact(totalAmt)}` : `$${compact(totalAmt)}`;
    const legend = topN.map(([name,amt],i) => {
      const color=colors[i%colors.length];
      return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #F3F3F3">
        <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>
        <span style="font-size:11px;flex:1;color:#374151;min-width:0;line-height:1.3;word-break:break-word" title="${h(name)}">${h(name)}</span>
        <span style="font-size:11px;font-weight:500;color:#18191B;flex-shrink:0;padding-left:8px">${isPro?money(amt):moneyUSD(amt)}</span>
      </div>`;
    }).join('');
    return `<div style="display:flex;align-items:center;gap:4px">
      <svg width="260" height="260" viewBox="0 0 260 260" style="flex-shrink:0;display:block">
        ${paths}
        <text x="${CX}" y="${CY-12}" text-anchor="middle" font-size="11" fill="#9ca3af" font-family="inherit" letter-spacing=".07em">COLLECTED</text>
        <text x="${CX}" y="${CY+14}" text-anchor="middle" font-size="21" font-weight="700" fill="#1A1C2E" font-family="inherit">${centerTotal}</text>
      </svg>
      <div style="flex:1;min-width:0;padding-right:4px">${legend}</div>
    </div>`;
  }

  // ── KPI card helper ───────────────────────────────────────
  function kpi(label, value, note, icon, action='', color='purple', trend='') {
    const click = action ? `onclick="${action}"` : '';
    const clickable = action ? 'style="cursor:pointer"' : '';
    let trendHtml = '';
    if (trend) {
      const up = trend.startsWith('+');
      const trendColor = up ? '#059669' : '#E11D48';
      const trendBg = up ? '#ECFDF5' : '#FFF1F2';
      const trendIcon = up ? 'ti-trending-up' : 'ti-trending-down';
      trendHtml = `<span class="dv5-kpi-trend" style="display:inline-flex;align-items:center;gap:3px;margin-top:6px;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:500;background:${trendBg};color:${trendColor}"><i class="ti ${trendIcon}" style="font-size:10px"></i>${h(trend)}</span>`;
    }
    return `<div class="dv5-kpi" ${click} ${clickable}>
      <div class="dv5-kpi-icon ${color||'purple'}"><i class="ti ${h(icon)}"></i></div>
      <div class="dv5-kpi-val">${h(String(value))}</div>
      <div class="dv5-kpi-label">${h(label)}</div>
      <div class="dv5-kpi-note">${h(note)}</div>
      ${trendHtml}
    </div>`;
  }

  // ── Colored stat card (shadcn hotel style) ───────────────
  // bgColor: CSS color string for card background
  // iconBg: CSS color string for icon square background
  function statCard(icon, value, label, sub, bgColor, iconBg, iconColor, action='') {
    const click = action ? `onclick="${action}"` : '';
    const cursor = action ? 'cursor:pointer' : 'cursor:default';
    return `<div class="dv5-stat-card" style="${cursor}" ${click}>
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div class="dv5-stat-icon"><i class="ti ${h(icon)}"></i></div>
        <i class="ti ti-dots-vertical" style="font-size:15px;opacity:.35"></i>
      </div>
      <div class="dv5-stat-val">${h(String(value))}</div>
      <div class="dv5-stat-label">${h(label)}</div>
      <div class="dv5-stat-sub">${h(sub)}</div>
    </div>`;
  }

  // ── File manager card (shadcn file manager) ───────────────
  function fileCard(icon, iconColor, iconBg, barColor, label, count, total, caption, action='') {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    const click = action ? `onclick="${action}"` : '';
    return `<div class="dv5-file-card" ${click}>
      <div class="dv5-file-card-head">
        <span class="dv5-file-card-label">${h(label)}</span>
        <div class="dv5-file-icon-box" style="background:${iconBg};color:${iconColor}">
          <i class="ti ${h(icon)}" style="font-size:20px"></i>
        </div>
      </div>
      <div class="dv5-file-count">${h(String(count))}</div>
      <div class="dv5-file-bar-wrap">
        <div class="dv5-file-bar" style="width:${pct}%;background:${barColor}"></div>
      </div>
      <div class="dv5-file-foot">
        <span>${h(caption)}</span>
        <span>${pct}%</span>
      </div>
      <div class="dv5-file-link">View more <i class="ti ti-arrow-right" style="font-size:11px"></i></div>
    </div>`;
  }

  // ── Priority card helper ──────────────────────────────────
  function priority(icon, num, label, note, cardBg, iconBg, action='') {
    const click = action ? `onclick="${action}"` : '';
    return `<div class="dv5-priority" ${click}>
      <div class="dv5-priority-icon"><i class="ti ${h(icon)}"></i></div>
      <strong>${h(String(num))}</strong>
      <span>${h(label)}</span>
      <small>${h(note)}</small>
    </div>`;
  }

  // ── Task row helper ───────────────────────────────────────
  function taskRow(t, idx) {
    const isManual = t.manual;
    const iconClass = t.priority==='High'||t.label==='Overdue' ? 'high' : 'med';
    const pillClass = t.priority==='High'||t.label==='Overdue' ? 'red' : 'amber';
    const dismiss = isManual
      ? `<button class="dv5-action-btn" onclick="event.stopPropagation();dismissManualTask(${idx})" style="margin-left:6px" title="Dismiss"><i class="ti ti-x"></i></button>`
      : `<button class="dv5-action-btn" onclick="event.stopPropagation();dismissTask('${t.key}')" style="margin-left:6px" title="Dismiss"><i class="ti ti-x"></i></button>`;
    return `<div class="dv5-task-item" onclick="${isManual?'':t.action}" style="${isManual?'':'cursor:pointer'}">
      <div class="dv5-task-icon ${iconClass}"><i class="ti ${h(t.icon||'ti-checkbox')}"></i></div>
      <div class="dv5-task-body">
        <div class="dv5-task-title">${h(t.title)}</div>
        <div class="dv5-task-meta">${h(t.meta||'Manual task')}</div>
      </div>
      <span class="dv5-pill ${pillClass}">${h(t.label||'Todo')}</span>
      ${dismiss}
    </div>`;
  }

  // ── Trend bar chart (cash flow visual) ───────────────────
  function cashFlowBars() {
    // Use real paid data per month if available; otherwise use stored trend
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const now = new Date();
    const bars = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      const monthLabel = months[d.getMonth()];
      // Try to find any paid amounts from this month's timelines
      const monthStr = d.toISOString().slice(0,7);
      let paid = 0;
      (Array.isArray(proDB)?proDB:[]).forEach(r => {
        // Use timeline entries to approximate - fallback to 0
        (allTimelines?.[`pro_${r.id}`]||[]).forEach(e => {
          if (String(e.ts||'').startsWith(monthStr) && String(e.action||'').toLowerCase().includes('paid')) {
            paid += Number(r.paid)||0;
          }
        });
      });
      bars.push({label:monthLabel, height:paid>0 ? Math.min(Math.round(paid/1000),100) : 0});
    }
    return bars.map(b => `<div class="dv5-bar-wrap"><div class="dv5-bar" style="height:${b.height}%"></div><span>${h(b.label)}</span></div>`).join('');
  }

  // ── Recent activity from timelines ───────────────────────
  function recentActivity(limit=6) {
    const entries = Object.entries(allTimelines||{})
      .flatMap(([key,arr]) => (arr||[]).map(e => ({...e, key})))
      .filter(e => e.ts || e.at)
      .sort((a,b) => new Date(b.ts||b.at||0) - new Date(a.ts||a.at||0))
      .slice(0, limit);
    if (!entries.length)
      return `<div class="dv5-empty">Activity appears here as candidates are updated, paid, and moved through stages.</div>`;
    return entries.map(e => `
      <div class="dv5-activity-item">
        <div class="dv5-activity-icon"><i class="ti ti-history"></i></div>
        <div>
          <div class="dv5-activity-title">${h(e.action||e.text||'Candidate updated')}</div>
          <div class="dv5-activity-meta">by ${h(e.user||'Dreco')} · ${h(fmt(e.ts||e.at||''))}</div>
        </div>
      </div>`).join('');
  }

  // ── Ensure section divs exist in content area ─────────────
  function ensureSections() {
    const area = document.querySelector('.content-area');
    if (!area) return;
    TABS.forEach(t => {
      if (!document.getElementById(`${t}-section`)) {
        const div = document.createElement('div');
        div.id = `${t}-section`;
        div.style.display = 'none';
        div.className = 'dv5-section';
        area.appendChild(div);
      }
    });
  }

  // ── Sidebar rebuild ───────────────────────────────────────
  let sidebarBuilt = false;
  function buildSidebar() {
    if (sidebarBuilt) return;
    const side = document.querySelector('#app .sidebar');
    if (!side) return;
    const navItem = t => `<a class="nav-item" id="nav-${t}" onclick="switchTab('${t}')" title="${h(TITLES[t])}">
      <i class="ti ${h(ICONS[t])}" style="font-size:15px;width:16px;flex-shrink:0"></i>
      <span class="nav-item-label" style="font-size:12.5px;font-weight:625;letter-spacing:0">${h(TITLES[t])}</span>
    </a>`;
    side.innerHTML = `
      <div class="sidebar-top">
        <a class="sidebar-logo" onclick="switchTab('dash')" aria-label="Dreco home">
          <img class="dreco-wordmark dreco-wordmark-lime" src="/wordmark-lime.png" alt="Dreco">
        </a>
        <button class="sidebar-toggle" onclick="toggleSidebar()" type="button" aria-label="Toggle sidebar">
          <i class="ti ti-chevrons-left"></i>
        </button>
      </div>
      <div class="sidebar-divider"></div>
      <div class="sidebar-search-bar" role="button" tabindex="0" onclick="document.querySelector('#cmd-modal')&&openCmd()">
        <i class="ti ti-search"></i><span>Search...</span><kbd>⌘K</kbd>
      </div>
      <div class="nav-section-label" style="font-size:10px;letter-spacing:.08em;font-weight:438;text-transform:uppercase;opacity:.5;margin:12px 0 2px 10px;padding:0">Workspace</div>
      ${['dash','pipeline','candidates'].map(navItem).join('')}
      <div class="nav-section-label" style="font-size:10px;letter-spacing:.08em;font-weight:438;text-transform:uppercase;opacity:.5;margin:12px 0 2px 10px;padding:0">Operations</div>
      ${['finance','documents','reports','clients','settings'].map(navItem).join('')}
      <div class="nav-spacer"></div>
      <div class="sidebar-company-name" id="sidebar-company-name">${h(co())}</div>`;
    sidebarBuilt = true;
  }

  function markActive(t) {
    $$('#app .nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`nav-${t}`)?.classList.add('active');
    const title = document.getElementById('topbar-title');
    if (title) title.textContent = TITLES[t] || 'Dreco';
  }

  // switchTab is now handled by the base function declaration.
  // window.renderXPage aliases are set below so the base router can call them.

  // ══════════════════════════════════════════════════════════
  // SECTION RENDERERS
  // ══════════════════════════════════════════════════════════

  // ── 1. DASHBOARD ──────────────────────────────────────────
  function renderDash() {
    ensureSections(); buildSidebar();
    const el = document.getElementById('dash-section'); if (!el) return;
    const isPro = jobTypeTab === 'pro';
    const proRows = proDB || [];
    const lbFiltered = lbCountryFilter ? (lbDB||[]).filter(r=>(r.country||'')=== lbCountryFilter) : (lbDB||[]);
    const rows = isPro ? proRows : lbFiltered;

    // Use normalised allRows for accurate computed fields (balance, hasDoc)
    const allNorm = allRows();
    const proNorm = allNorm.filter(r=>r.type==='pro');
    const lbNorm  = lbCountryFilter ? allNorm.filter(r=>r.type==='lb'&&r.country===lbCountryFilter) : allNorm.filter(r=>r.type==='lb');
    const normRows = isPro ? proNorm : lbNorm;

    // Pro-specific dash metrics
    const awaitPermit = proNorm.filter(r=>proStageMatches(r, ['WORK PERMIT','MOL','PENDING MOL'])).length;
    const visaReady = proNorm.filter(r=>proStageMatches(r, ['VISA','PENDING VISA'])).length;
    const tickets   = proNorm.filter(r=>['TICKET BOOKED','PENDING TRAVEL'].includes(r.stage)).length;
    const unpaidPro = proNorm.filter(r=>r.balance>0).length;
    // LB-specific
    const lbRefundPending = lbNorm.filter(r=>['REFUND PENDING','REFUND COMPLETE'].includes(r.stage)).length;
    const LB_SELECTED_AND_BEYOND = ['SELECTED','PASSPORT APPLIED','VISA PROCESSING','TRAVELLED','REFUND PENDING','REFUND COMPLETE'];
    const lbSelected      = lbNorm.filter(r=>LB_SELECTED_AND_BEYOND.includes(r.stage)).length;
    // Count by ppStatus field — stage is often left at SELECTED even after passport is applied
    const lbPassportApplied = lbNorm.filter(r=>['APPLIED','PUSHED'].includes(r.ppStatus||'')&&!r.own_passport).length;
    const unpaidLB        = lbNorm.filter(r=>r.balance>0&&!r.own_passport).length;

    const travelled = normRows.filter(r=>String(r.stage).toUpperCase()==='TRAVELLED').length;
    const totalPaidPro = proNorm.reduce((s,r)=>s+r.paid,0);
    const totalPaidLB  = lbNorm.reduce((s,r)=>s+r.paid,0);

    const proFlowSteps = [
      ['Interview',  proNorm.filter(r=>proStageMatches(r, ['INTERVIEW','PENDING OFFER LETTER'])).length],
      ['Offer',      proNorm.filter(r=>proStageMatches(r, ['OFFER LETTER'])).length],
      ['Medical',    proNorm.filter(r=>proStageMatches(r, ['MEDICAL & ATTESTATION'])).length],
      ['Permit',     proNorm.filter(r=>proStageMatches(r, ['WORK PERMIT','MOL','PENDING MOL'])).length],
      ['Visa',       proNorm.filter(r=>proStageMatches(r, ['VISA','PENDING VISA'])).length],
      ['Ticket',     proNorm.filter(r=>['TICKET BOOKED','PENDING TRAVEL'].includes(r.stage)).length],
      ['Travelled',  proNorm.filter(r=>r.stage==='TRAVELLED').length],
    ];
    const LB_UNSELECTED_STAGES = ['DOCS SUBMITTED','DOCUMENTS SUBMITTED','SUBMITTED','PROFILE SENT','NOT YET'];
    const lbFlowSteps = [
      ['Unselected', lbNorm.filter(r=>LB_UNSELECTED_STAGES.includes(r.stage)||!LB_SELECTED_AND_BEYOND.includes(r.stage)).length],
      ['Selected',   lbNorm.filter(r=>LB_SELECTED_AND_BEYOND.includes(r.stage)&&!['TRAVELLED','REFUND PENDING','REFUND COMPLETE'].includes(r.stage)).length],
      ['Travelled',  lbNorm.filter(r=>['TRAVELLED','REFUND PENDING','REFUND COMPLETE'].includes(r.stage)).length],
    ];
    const flowSteps = isPro ? proFlowSteps : lbFlowSteps;
    const tasks = buildTasks().slice(0,5);
    const totalPaid = isPro ? totalPaidPro : totalPaidLB;
    const totalExpected = Math.max(1, normRows.reduce((s,r)=>s+(Number(r.commission)||Number(r.toRefund)||r.balance+r.paid||0),0));
    const collectionRate = Math.min(100, Math.round((totalPaid / totalExpected) * 100));
    const travelReadiness = Math.min(100, Math.round(((tickets + travelled) / Math.max(normRows.length,1)) * 100));
    const actionRows = [];

    el.innerHTML = `
      <div class="dv5-page">
        <div class="dv5-page-head">
          <div>
            <h1>${greeting()}, ${h(fname())} 👋</h1>
            <p>Here's what needs your attention today.</p>
          </div>
          <div class="dv5-head-actions">
            ${jobTypeTabs()}
            <button class="dv5-btn primary" onclick="${isPro?'openProForm()':'openLBForm()'}"><i class="ti ti-plus"></i>Add</button>
          </div>
        </div>
        ${!isPro ? lbCountryBar(lbDB||[]) : ''}

        <div class="dv5-priority-grid">
          ${isPro ? `
            ${priority('ti-file-description', awaitPermit, 'Work Permits',      'Follow permits',       '#EDE8FB','#4825B8', "switchTab('pipeline')")}
            ${priority('ti-id-badge-2',       visaReady, 'Visas Ready',        'Ready to travel',      '#EDEDFB','#252677', "switchTab('pipeline')")}
            ${priority('ti-coin',             unpaidPro, 'Unpaid Commissions', 'Requires follow up',   '#FCECEA','#8B2010', "switchTab('finance')")}
            ${priority('ti-plane-departure',  tickets,   'Tickets Pending',    'Awaiting issue',       '#EDFAA8','#5A7A10', "switchTab('pipeline')")}
            ${priority('ti-users',            normRows.length, 'Total Candidates', 'In pipeline',      '#F4F4EC','#1A1C2E', "switchTab('candidates')")}
          ` : `
            ${priority('ti-users',            lbSelected,       'Selected',          'Cumulative selected',  '#EDEDFB','#252677', "switchTab('pipeline')")}
            ${priority('ti-passport',         lbPassportApplied,'Passport Applied',  'Applied by ppStatus',  '#EDFAA8','#5A7A10', "switchTab('candidates')")}
            ${priority('ti-credit-card',      lbRefundPending,  'Refund Pending',    'Refunds to process',   '#EDE8FB','#4825B8', "switchTab('finance')")}
            ${priority('ti-coin',             unpaidLB,         'Outstanding USD',   'Refunds not started',  '#FCECEA','#8B2010', "switchTab('finance')")}
            ${priority('ti-users',            normRows.length,  'Total Candidates',  'In pipeline',          '#F4F4EC','#1A1C2E', "switchTab('candidates')")}
          `}
        </div>

        <div class="dv5-card dv5-card-pipeline">
          <div class="dv5-card-head" style="margin-bottom:16px">
            <span class="dv5-card-title dv5-pipeline-title">${isPro?'Candidates':'General Jobs'} Pipeline</span>
            <button class="dv5-link dv5-pipeline-link" onclick="switchTab('pipeline')">View all →</button>
          </div>
          <div class="dv5-pipeline-flow" style="justify-content:space-between">
            ${flowSteps.map(([label,val], i) => {
              const maxVal = Math.max(...flowSteps.map(([,v])=>v), 1);
              const pct = Math.round((val/maxVal)*100);
              const isLast = i === flowSteps.length - 1;
              return `
              <div class="dv5-flow-step" style="flex:1;position:relative;padding:0 8px">
                <strong style="font-size:28px">${h(String(val))}</strong>
                <span style="font-size:10px;letter-spacing:.04em;text-transform:uppercase">${h(label)}</span>
                <div class="dv5-flow-track">
                  <div class="dv5-flow-fill ${isLast?'done':''}" style="width:${pct}%"></div>
                </div>
              </div>${!isLast ? '<div class="dv5-flow-arrow" style="flex-shrink:0;padding:0 2px;padding-bottom:18px"><i class="ti ti-chevron-right"></i></div>' : ''}`;
            }).join('')}
          </div>
        </div>

        <div class="dv5-home-analytics">
          <div class="dv5-card dv5-line-card" style="margin-bottom:0">
            <div class="dv5-card-head">
              <div>
                <span class="dv5-card-title">Candidate Movement</span>
                <div class="dv5-card-sub">${isPro?'Professional':'General'} — new candidates added per week</div>
              </div>
              <button class="dv5-link" style="color:rgba(190,18,60,.7)" onclick="switchTab('candidates')">All →</button>
            </div>
            ${buildLineChart(normRows, candMovMonth || new Date().toISOString().slice(0,7))}
          </div>

          <div class="dv5-card" style="margin-bottom:0">
            <div class="dv5-card-head">
              <div>
                <span class="dv5-card-title">Status Summary</span>
                <div class="dv5-card-sub">${isPro?'Professional':'General'} — at a glance</div>
              </div>
            </div>
            <div class="dv5-status-summary">
              <div><span>${isPro?'Active Processing':'In Pipeline'}</span><small>${isPro?'Professionals in progress':'General jobs active'}</small></div>
              <strong>${h(String(normRows.length-travelled))}</strong>
              <svg viewBox="0 0 220 72" preserveAspectRatio="none" aria-hidden="true"><path d="M6 46 C46 10 80 18 110 42 C145 72 178 68 214 9" fill="none" stroke="#DDF56C" stroke-width="4" stroke-linecap="round"/></svg>
            </div>
            <div class="dv5-ring-card">
              ${ringStat('Collection Rate', collectionRate, '#1A1C2E')}
              ${ringStat('Travel Readiness', travelReadiness, '#DDF56C')}
            </div>
          </div>
        </div>

        <div class="dv5-dashboard-lower" style="margin-bottom:12px">
          <div class="dv5-card" style="margin-bottom:0">
            <div class="dv5-card-head">
              <span class="dv5-card-title">Upcoming Reminders</span>
              <button class="dv5-link" onclick="switchTab('pipeline')">All →</button>
            </div>
            <div class="dv5-task-list">
              ${tasks.length ? tasks.map(taskRow).join('') : '<div class="dv5-empty">No urgent tasks.</div>'}
            </div>
          </div>
          <div class="dv5-card dv5-funnel-card" style="margin-bottom:0">
            <div class="dv5-card-head">
              <div>
                <span class="dv5-card-title">Stage Breakdown</span>
                <div class="dv5-card-sub">Distribution across all stages</div>
              </div>
            </div>
            ${buildStageDonut(normRows)}
          </div>
        </div>

      </div>`;
  }
  window.renderDash = renderDash;

  // ── 2. PIPELINE ───────────────────────────────────────────
  let pipelineSearch = '';
  function restoreInputFocus(id, cursor) {
    requestAnimationFrame(() => {
      const input = document.getElementById(id);
      if (!input) return;
      input.focus({ preventScroll: true });
      if (typeof input.setSelectionRange === 'function') input.setSelectionRange(cursor, cursor);
    });
  }
  window.setPipelineSearch = v => {
    const cursor = document.activeElement?.selectionStart ?? v.length;
    pipelineSearch = v;
    renderPipeline();
    restoreInputFocus('pipeline-search', cursor);
  };

  function renderPipeline() {
    const el = document.getElementById('pipeline-section'); if (!el) return;
    const isPro = jobTypeTab === 'pro';
    try {
    const pipelineRows = allRows();
    const q = String(pipelineSearch || '').toLowerCase();
    const matchSearch = r => !q || [r.name,r.position,r.company,r.pp,r.country,r.phone].join(' ').toLowerCase().includes(q);
    const proRows = pipelineRows.filter(r=>r.type==='pro'&&matchSearch(r));
    const lbRows = pipelineRows.filter(r=>r.type==='lb'&&matchSearch(r));
    const lbFiltered = lbCountryFilter ? lbRows.filter(r=>(r.country||'')=== lbCountryFilter) : lbRows;
    const stages = isPro ? activeWorkflowStages('pro') : activeWorkflowStages('lb');
    const totalShown = isPro ? proRows.length : lbFiltered.length;

    el.innerHTML = `
      <div class="dv5-page">
        <div class="dv5-page-head">
          <div><h1>Pipeline</h1><p>${isPro?'Professional candidates — KES commission pipeline.':'General Jobs — USD refund pipeline.'}</p></div>
          <div class="dv5-head-actions">
            <div style="position:relative">
              <i class="ti ti-search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-3);font-size:14px;pointer-events:none"></i>
              <input type="search" id="pipeline-search" placeholder="Search candidates…" value="${h(pipelineSearch)}"
                oninput="setPipelineSearch(this.value)"
                style="height:36px;border:1.5px solid var(--border);border-radius:8px;padding:0 10px 0 32px;font-size:13px;background:#fff;width:200px;outline:none">
            </div>
            ${jobTypeTabs()}
            <button class="dv5-btn primary" onclick="${isPro?'openProForm()':'openLBForm()'}"><i class="ti ti-plus"></i>Add</button>
          </div>
        </div>
        ${!isPro ? lbCountryBar(lbDB||[]) : ''}
        ${q ? `<div style="font-size:12px;color:var(--text-3);margin-top:8px"><i class="ti ti-filter"></i> Showing ${totalShown} result${totalShown!==1?'s':''} for "<strong>${h(q)}</strong>"</div>` : ''}
        <div class="dv5-kanban" style="margin-top:12px">
          ${stages.map(stage => {
            const items = isPro
              ? proRows.filter(r=>String(r.pipelineStage || '').toUpperCase()===String(stage || '').toUpperCase())
              : lbFiltered.filter(r=>String(r.pipelineStage || '').toUpperCase()===String(stage || '').toUpperCase());
            const label = stage.replace(/^DOCS /,'');
            return `<div class="dv5-col">
              <div class="dv5-col-head">
                <span>${h(label)}</span>
                <span class="dv5-col-count">${items.length}</span>
              </div>
              <div class="dv5-col-body">
                ${items.length ? items.map(r => `
                  <div class="dv5-pipe-card" onclick="${isPro?`editPro(${r.id})`:`editLB(${r.id})`}">
                    <div class="dv5-pipe-name">${h(r.name)}</div>
                    <div class="dv5-pipe-meta">${h(r.position||r.country||'—')} · ${h(r.company||'—')}</div>
                    ${progressMini(r)}
                    <div class="dv5-pipe-foot">
                      <span><i class="ti ti-id"></i>${h(r.pp||'No PP')}</span>
                      ${isPro && r.commission ? `<span>${money(r.commission)}</span>` : ''}
                      ${!isPro && r.commission ? `<span>${moneyUSD(r.commission)}</span>` : ''}
                      ${!isPro && r.own_passport ? `<span style="color:#059669;font-size:9px">Own PP</span>` : ''}
                      ${r.followUp ? `<span style="color:#D97706;font-size:9px"><i class="ti ti-calendar-event"></i>${fmt(r.followUp)}</span>` : ''}
                    </div>
                  </div>`).join('') : `<div class="dv5-empty">${q?'No matches':'No candidates'}</div>`}
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    } catch (error) {
      console.error('Dreco pipeline render failed', error);
      el.innerHTML = `<div class="dv5-page"><div class="dv5-page-head"><div><h1>Pipeline</h1><p>We could not load the pipeline board.</p></div><button class="dv5-btn" onclick="window.renderPipelinePage?.()"><i class="ti ti-refresh"></i> Retry</button></div><div class="dv5-empty" style="background:#fff;border:1px solid var(--border);border-radius:16px;padding:18px;text-align:left;color:#991b1b">Pipeline render error: ${h(error?.message || error || 'Unknown error')}</div></div>`;
    }
  }
  window.renderPipelinePage = renderPipeline;

  // ── 3. CANDIDATES ─────────────────────────────────────────
  let candidateSearch = '';
  let candidateTypeFilter = '';
  let candidateStageFilter = '';
  let candidateViewFilter = 'all';
  let selectedCandidates = new Set(); // 'type_id' strings

  function setCandidateSearch(v) {
    const cursor = document.activeElement?.selectionStart ?? v.length;
    candidateSearch = v;
    renderCandidates();
    restoreInputFocus('cand-search', cursor);
  }
  window.setCandidateSearch = setCandidateSearch;
  window.setCandidateStageFilter = v => { candidateStageFilter = v; renderCandidates(); };
  window.setCandidateViewFilter  = v => { candidateViewFilter  = v; renderCandidates(); };
  window.clearSelectedCandidates = () => { selectedCandidates.clear(); renderCandidates(); };

  function filterCandidates() {
    // Always scoped to the active job type tab
    let rows = allRows().filter(r => r.type === jobTypeTab);
    const q = candidateSearch.toLowerCase();
    if (candidateStageFilter) rows = rows.filter(r=>r.stage===candidateStageFilter);
    if (candidateViewFilter==='follow') rows = rows.filter(r=>workflowStatus(r).level !== 'ok');
    if (candidateViewFilter==='balance') rows = rows.filter(r=>r.balance>0);
    if (q) rows = rows.filter(r=>[r.name,r.pp,r.phone,r.position,r.company,r.country,r.stage].join(' ').toLowerCase().includes(q));
    return rows;
  }

  function toggleCandSelect(key, checked) {
    if (checked) selectedCandidates.add(key);
    else selectedCandidates.delete(key);
    const bar = document.getElementById('cand-bulk-bar');
    const countEl = document.getElementById('cand-bulk-count');
    if (bar) bar.style.display = selectedCandidates.size > 0 ? 'flex' : 'none';
    if (countEl) countEl.textContent = selectedCandidates.size + ' selected';
    const selectAll = document.getElementById('cand-select-all');
    if (selectAll) {
      const list = filterCandidates();
      selectAll.indeterminate = selectedCandidates.size > 0 && selectedCandidates.size < list.length;
      selectAll.checked = list.length > 0 && list.every(r => selectedCandidates.has(r.type+'_'+r.id));
    }
  }
  window.toggleCandSelect = toggleCandSelect;

  function toggleSelectAll(checked) {
    filterCandidates().forEach(r => {
      const key = r.type+'_'+r.id;
      if (checked) selectedCandidates.add(key); else selectedCandidates.delete(key);
    });
    renderCandidates();
  }
  window.toggleSelectAll = toggleSelectAll;

  async function bulkChangeStage(stage) {
    if (!stage || !selectedCandidates.size) return;
    const list = filterCandidates().filter(r => selectedCandidates.has(r.type+'_'+r.id));
    for (const r of list) {
      const table = r.type==='pro' ? 'pro_candidates' : 'lb_candidates';
      await dbUpdate(table, r.id, r.type==='pro' ? {stage} : {stage, travelStatus: stage});
      const db2 = r.type==='pro' ? proDB : lbDB;
      const idx = db2.findIndex(x => x.id===r.id);
      if (idx >= 0) { if (r.type==='pro') db2[idx].stage = stage; else { db2[idx].travelStatus = stage; db2[idx].stage = stage; } }
    }
    selectedCandidates.clear();
    renderCandidates();
    showToast('Stage updated for '+list.length+' candidate'+(list.length!==1?'s':''), 'success');
  }
  window.bulkChangeStage = bulkChangeStage;

  function bulkExportSelected() {
    const rows = filterCandidates().filter(r => selectedCandidates.has(r.type+'_'+r.id));
    if (!rows.length) return;
    const proRows = rows.filter(r=>r.type==='pro');
    const lbRows  = rows.filter(r=>r.type==='lb');
    if (proRows.length) { lastProFiltered = proRows; exportCSV('pro'); }
    if (lbRows.length)  { lastLBFiltered  = lbRows;  exportCSV('lb'); }
  }
  window.bulkExportSelected = bulkExportSelected;

  async function bulkDeleteSelectedCandidates() {
    const rows = filterCandidates().filter(r => selectedCandidates.has(r.type+'_'+r.id));
    if (!rows.length) return;
    const sample = rows.slice(0, 3).map(r => r.name).join(', ');
    if (!confirm(`Delete ${rows.length} selected candidate${rows.length!==1?'s':''} and their documents/timeline records?\n\n${sample}${rows.length>3?'...':''}\n\nThis cannot be undone.`)) return;
    const proIds = new Set(rows.filter(r=>r.type==='pro').map(r=>r.id));
    const lbIds = new Set(rows.filter(r=>r.type==='lb').map(r=>r.id));
    setProDB(proDB.filter(r => !proIds.has(r.id)));
    setLbDB(lbDB.filter(r => !lbIds.has(r.id)));
    for (const r of rows) {
      if (typeof deleteCandidateArtifacts === 'function') await deleteCandidateArtifacts(r.type, r.id);
      if (typeof useCloud === 'function' && useCloud() && typeof dbDelete === 'function') await dbDelete(r.type==='pro' ? 'pro_candidates' : 'lb_candidates', r.id);
      if (typeof auditAction === 'function') auditAction(r.type==='pro' ? 'Professional Jobs' : 'General Jobs', 'Candidate deleted', r.name || '');
    }
    selectedCandidates.clear();
    saveLocalStore?.();
    renderCandidates();
    window.renderPipelinePage?.();
    window.renderDash?.();
    showToast?.(`Deleted ${rows.length} candidate${rows.length!==1?'s':''}`, 'success');
  }
  window.bulkDeleteSelectedCandidates = bulkDeleteSelectedCandidates;

  function renderCandidates() {
    const el = document.getElementById('candidates-section'); if (!el) return;
    if (profileViewType && profileViewId) { renderCandidateProfilePage(el, profileViewType, profileViewId); return; }
    const isPro = jobTypeTab === 'pro';
    const lbBaseRows = lbCountryFilter ? (lbDB||[]).filter(r=>(r.country||'')=== lbCountryFilter) : (lbDB||[]);
    let all = isPro
      ? (proDB||[]).map(r=>({...r,type:'pro',position:r.position||'',company:r.company||'',country:r.country||'',stage:r.stage||'SUBMITTED',commission:Number(r.commission)||0,paid:Number(r.paid||0),balance:Math.max((Number(r.commission)||0)-(Number(r.paid||0)),0)}))
      : lbBaseRows.map(r=>{const r1=Number(r.r1Amt||r.r1_amt)||0,r2=Number(r.r2Amt||r.r2_amt)||0,toRef=Number(r.toRefund||r.to_refund)||0;return{...r,type:'lb',position:r.country||'General Job',company:r.company||r.country||'—',country:r.country||'—',stage:r.travelStatus||r.travel_status||r.stage||'DOCS SUBMITTED',commission:toRef,paid:r1+r2,balance:balLB(r)};});
    const allCandidateRows = allRows();
    all = isPro
      ? allCandidateRows.filter(r=>r.type==='pro')
      : allCandidateRows.filter(r=>r.type==='lb' && (!lbCountryFilter || (r.country||'')===lbCountryFilter));
    const stageOptions = isPro ? activeWorkflowStages('pro') : activeWorkflowStages('lb');
    const q = candidateSearch.toLowerCase();
    let list = all.filter(r => {
      if (candidateStageFilter && r.pipelineStage !== candidateStageFilter) return false;
      if (candidateViewFilter==='follow' && workflowStatus(r).level === 'ok') return false;
      if (candidateViewFilter==='balance' && r.balance<=0) return false;
      if (q && ![r.name,r.pp,r.phone,r.position,r.company,r.country,r.stage].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
    const allSel = list.length > 0 && list.every(r => selectedCandidates.has(r.type+'_'+r.id));
    const someSel = selectedCandidates.size > 0;
    const allStages = isPro ? activeWorkflowStages('pro') : activeWorkflowStages('lb');
    el.innerHTML = `
      <div class="dv5-page">
        <div class="dv5-page-head">
          <div><h1>Candidates</h1><p>${isPro?'Professional placements — commissions in KES.':'General Jobs — refunds in USD.'}</p></div>
          <div class="dv5-head-actions">
            ${jobTypeTabs()}
            <button class="dv5-btn primary" onclick="${isPro?'openProForm()':'openLBForm()'}"><i class="ti ti-plus"></i>Add</button>
          </div>
        </div>
        ${!isPro ? lbCountryBar(lbDB||[]) : ''}
        <div class="dv5-bulk-bar" id="cand-bulk-bar" style="display:${someSel?'flex':'none'}">
          <span id="cand-bulk-count">${selectedCandidates.size} selected</span>
          <select class="dv5-select" onchange="bulkChangeStage(this.value);this.value=''">
            <option value="">Change stage…</option>
            ${allStages.map(s=>`<option value="${h(s)}">${h(s)}</option>`).join('')}
          </select>
          <button class="dv5-btn" onclick="bulkExportSelected()"><i class="ti ti-download"></i>Export selected</button>
          <button class="dv5-btn danger" onclick="bulkDeleteSelectedCandidates()"><i class="ti ti-trash"></i>Delete selected</button>
          <button class="dv5-btn" onclick="window.clearSelectedCandidates()"><i class="ti ti-x"></i>Clear</button>
        </div>
        <div class="dv5-toolbar">
          <div class="dv5-toolbar-left">
            <input class="dv5-input" id="cand-search" placeholder="Search name, passport, company…"
              value="${h(candidateSearch)}" oninput="setCandidateSearch(this.value)">
            <select class="dv5-select" onchange="window.setCandidateStageFilter(this.value)">
              <option value="">All Stages</option>
              ${stageOptions.map(s=>`<option value="${h(s)}" ${candidateStageFilter===s?'selected':''}>${h(s)}</option>`).join('')}
            </select>
          </div>
          <div class="dv5-toolbar-right">
            <div class="dv5-view-tabs">
              ${[['all','All'],['follow','Needs Action'],['balance','Has Balance']].map(([v,l])=>
                `<button class="dv5-view-tab ${candidateViewFilter===v?'active':''}"
                  onclick="window.setCandidateViewFilter('${v}')">${l}</button>`
              ).join('')}
            </div>
            <span class="dv5-count">Showing ${list.length} of ${all.length}</span>
            <button class="dv5-btn" onclick="exportCSV('${isPro?'pro':'lb'}')"><i class="ti ti-download"></i>Export</button>
          </div>
        </div>
        <div class="dv5-table-card">
          <div class="dv5-table-wrap">
            <table class="dv5-table">
              <thead><tr>
                <th style="width:36px"><input type="checkbox" id="cand-select-all" ${allSel?'checked':''} onchange="toggleSelectAll(this.checked)"></th>
                <th>Name</th><th>${isPro?'Job Title':'Destination'}</th>${isPro?'<th>Company</th>':''}
                <th>Stage</th>${!isPro?'<th>Passport</th>':''}<th>Next Action</th><th>Readiness</th>${isPro?'<th>Submitted</th>':''}<th></th>
              </tr></thead>
              <tbody>
                ${list.length ? list.map(r => {
                  const key = r.type+'_'+r.id;
                  const sel = selectedCandidates.has(key);
                  const ppStatus = r.ppStatus||'NOT APPLIED';
                  const ppLabel = r.own_passport ? '<span class="dv5-badge" style="background:#E7F0E9;color:#386A52">Has PP</span>'
                    : ['APPLIED','PUSHED'].includes(ppStatus) ? '<span class="dv5-badge" style="background:#FEF9C3;color:#A16207">Applied</span>'
                    : r.stage==='SELECTED'||['SELECTED','PASSPORT APPLIED','VISA PROCESSING','TRAVELLED','REFUND PENDING','REFUND COMPLETE'].includes(r.stage) ? '<span class="dv5-badge" style="background:#FEE2E2;color:#B91C1C">No PP</span>'
                    : '<span class="dv5-badge" style="background:#F3F4F6;color:#6B7280">—</span>';
                  return `
                  <tr class="${sel?'dv5-row-selected':''}" onclick="openCandidateProfile('${r.type}',${r.id})">
                    <td onclick="event.stopPropagation()">
                      <input type="checkbox" ${sel?'checked':''} onchange="toggleCandSelect('${key}',this.checked)">
                    </td>
                    <td><div class="dv5-name-cell">
                      ${avatar(r.name, r.type, r.id)}
                      <div>
                        <div class="dv5-name">${h(r.name)}</div>
                        <div class="dv5-sub">${h(r.pp||'No passport')} · ${h(r.phone||'No phone')}</div>
                      </div>
                    </div></td>
                    <td>${h(r.position)}</td>
                    ${r.type==='pro'?`<td>${h(r.company)}</td>`:''}
                    <td>${badge(r.pipelineStage)}</td>
                    ${r.type==='lb'?`<td>${ppLabel}</td>`:''}
                    <td><span class="dv5-next-action">${h(nextAction(r))}</span></td>
                    <td>${progressMini(r)}</td>
                    ${r.type==='pro'?`<td>${h(fmt(r.submitted))}</td>`:''}
                    <td onclick="event.stopPropagation()">
                      <button class="dv5-action-btn" onclick="${r.type==='pro'?`editPro(${r.id})`:`editLB(${r.id})`}" title="Edit">
                        <i class="ti ti-edit"></i>
                      </button>
                      <button class="dv5-action-btn" onclick="openDocs('${r.type}',${JSON.stringify(r.id)},'${js(r.name)}')" title="Documents">
                        <i class="ti ti-paperclip"></i>
                      </button>
                    </td>
                  </tr>`;
                }).join('') : `<tr><td colspan="9"><div class="dv5-empty">No candidates found.</div></td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }
  window.renderCandidatesPage = renderCandidates;
  window.renderCandidates = renderCandidates;

  const PRO_PIPELINE_TO_DB = {
    'INTERVIEW':'INTERVIEW',
    'OFFER LETTER':'OFFER LETTER',
    'MEDICAL & ATTESTATION':'MEDICAL & ATTESTATION',
    'WORK PERMIT':'WORK PERMIT',
    'VISA':'VISA',
    'TICKET BOOKED':'TICKET BOOKED',
    'TRAVELLED':'TRAVELLED',
  };

  async function _applyStageChange(type, id, targetPipelineStage) {
    const db = type === 'pro' ? proDB : lbDB;
    const rec = db.find(r => r.id == id);
    if (!rec) return;
    const targetDbStage = type === 'pro' ? (PRO_PIPELINE_TO_DB[targetPipelineStage] || targetPipelineStage) : targetPipelineStage;
    if (type === 'pro' && targetPipelineStage === 'TRAVELLED' && !rec.travel) {
      showToast('Set a travel date before marking as Travelled.','error'); return;
    }
    if (type === 'lb' && targetPipelineStage === 'TRAVELLED' && !rec.travelDate) {
      showToast('Set a travel date before marking as Travelled.','error'); return;
    }
    const prevStage = type === 'pro' ? rec.stage : (rec.travelStatus || rec.stage);
    if (type === 'pro') rec.stage = targetDbStage;
    else { rec.travelStatus = targetDbStage; rec.stage = targetDbStage; }
    renderCandidates();
    window.renderDash?.();
    window.openCandidateProfile?.(type, id);
    try {
      const table = type === 'pro' ? 'pro_candidates' : 'lb_candidates';
      const updateField = type === 'pro' ? { stage: targetDbStage } : { stage: targetDbStage, travelStatus: targetDbStage };
      await dbUpdate(table, id, updateField);
      addTimeline(type, id, `Stage set to ${targetPipelineStage}`);
      await saveTimeline(`${type}_${id}`);
      showToast(`Moved to ${targetPipelineStage}`, 'success');
    } catch(e) {
      if (type === 'pro') rec.stage = prevStage;
      else { rec.travelStatus = prevStage; rec.stage = prevStage; }
      renderCandidates();
      window.renderDash?.();
      showToast('Stage change failed — please try again', 'error');
      saveLocalStore?.();
      console.warn('stage save error', e);
    }
  }

  window.advanceStage = async function(type, id) {
    const curRow  = allRows().find(r => r.type===type && String(r.id)===String(id));
    const stages = activeWorkflowStages(type, curRow?.country);
    const curStage = type === 'pro' ? canonicalProProcessStage(curRow?.pipelineStage || curRow?.stage) : (curRow?.pipelineStage || stages[0]);
    const idx = stages.findIndex(s => s === curStage);
    if (idx === -1 || idx >= stages.length - 1) { showToast('Already at final stage','info'); return; }
    await _applyStageChange(type, id, stages[idx + 1]);
  };

  window.jumpToStage = async function(type, id, targetIdx) {
    const curRow = allRows().find(r => r.type===type && String(r.id)===String(id));
    const stages = activeWorkflowStages(type, curRow?.country);
    const targetPipelineStage = stages[targetIdx];
    if (!targetPipelineStage) return;
    if (curRow?.pipelineStage === targetPipelineStage) { showToast('Already at this stage','info'); return; }
    await _applyStageChange(type, id, targetPipelineStage);
  };

  // ── 4. TASKS ──────────────────────────────────────────────
  function renderTasks() {
    const el = document.getElementById('tasks-section'); if (!el) return;
    const auto = buildTasks();
    const manual = manualTasks.map((t,i) => ({...t, manual:true, priority:'Medium', label:'Todo', icon:'ti-check', idx:i}));
    const tasks = [...auto, ...manual];
    const high = tasks.filter(t=>t.priority==='High'||t.label==='Overdue');
    const med  = tasks.filter(t=>t.priority==='Medium');
    el.innerHTML = `
      <div class="dv5-page">
        <div class="dv5-page-head">
          <div><h1>Tasks</h1><p>Auto-generated action items plus your own manual tasks. Dismiss any item to clear it.</p></div>
          <div class="dv5-head-actions">
            <button class="dv5-btn primary" onclick="switchTab('candidates')"><i class="ti ti-users"></i>Open Candidates</button>
          </div>
        </div>
        <div class="dv5-stat-grid">
          ${statCard('ti-checkbox',      tasks.length,  'Open Tasks',      `Need attention`,                              '#F4F4EC','#372514','#fff')}
          ${statCard('ti-alert-triangle',high.length,   'High Priority',   `Urgent blockers`,                             '#FEF2F2','#DC2626','#fff')}
          ${statCard('ti-clock',         med.length,    'Medium',          `Stage follow ups`,                            '#FFFBEB','#D97706','#fff')}
          ${statCard('ti-coin',          allRows().filter(r=>r.balance>0).length,'Unpaid',    `Finance follow up`,        '#F0FDF4','#16A34A','#fff')}
        </div>
        <div class="dv5-card" style="margin-bottom:12px">
          <div class="dv5-card-head"><span class="dv5-card-title">Add Manual Task</span></div>
          <div style="display:flex;gap:8px;padding:0 16px 14px;flex-wrap:wrap;align-items:flex-end">
            <div style="flex:1;min-width:180px"><label style="font-size:11px;font-weight:438;color:#6b7280;display:block;margin-bottom:4px">Title</label>
              <input id="new-task-title" type="text" placeholder="e.g. Call Mr. Smith" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #e5e7eb;border-radius:7px;font-size:13px"></div>
            <div><label style="font-size:11px;font-weight:438;color:#6b7280;display:block;margin-bottom:4px">Due date</label>
              <input id="new-task-due" type="date" style="padding:8px 10px;border:1px solid #e5e7eb;border-radius:7px;font-size:13px"></div>
            <button class="dv5-btn primary" onclick="addManualTask()" style="height:36px;align-self:flex-end"><i class="ti ti-plus"></i>Add Task</button>
          </div>
        </div>
        <div class="dv5-card">
          <div class="dv5-card-head">
            <span class="dv5-card-title">Task Queue</span>
            <span class="dv5-card-sub">${tasks.length} items</span>
          </div>
          <div class="dv5-task-list">
            ${tasks.length ? tasks.map((t,i)=>taskRow(t, t.manual?t.idx:i)).join('') : '<div class="dv5-empty">Everything is clear. Workspace is clean.</div>'}
          </div>
        </div>
      </div>`;
  }
  window.renderTasksPage = renderTasks;

  // ── 5. FINANCE ────────────────────────────────────────────
  let financePositionFilter = '';
  let candMovMonth = new Date().toISOString().slice(0,7); // "YYYY-MM"
  window.setCandMovMonth = (v: string) => { candMovMonth = v; renderDash(); };

  let financeTab = 'latest'; // 'latest' | 'upcoming'
  let financeDatePreset = 'all'; // 'all','this_month','last_month','this_quarter','this_year'
  let financeClientSearch = '';
  let financeShowAllTx = false;
  window.setFinancePosition   = v => { financePositionFilter = v; renderFinance(); };
  window.setFinanceTab        = v => { financeTab = v; renderFinance(); };
  window.setFinanceDatePreset = v => { financeDatePreset = v; renderFinance(); };
  window.setFinanceClientSearch = v => { financeClientSearch = v; renderFinance(); };
  window.setFinanceShowAllTx  = (v: boolean) => { financeShowAllTx = v; renderFinance(); };

  function renderFinance() {
    const el = document.getElementById('finance-section'); if (!el) return;
    const expenses = (window.drecoExpenses || []);
    const expTotal = expenses.reduce((s,e)=>s+(Number(e.amount)||0),0);
    const expMonth = expenses.filter(e=>(e.date||'').slice(0,7)===new Date().toISOString().slice(0,7));
    const expMonthTotal = expMonth.reduce((s,e)=>s+(Number(e.amount)||0),0);
    const isPro = jobTypeTab === 'pro';
    const allFinRows = allRows();
    const proRows = allFinRows.filter(r=>r.type==='pro');
    const lbAllRows = allFinRows.filter(r=>r.type==='lb');
    const lbRows  = lbCountryFilter ? lbAllRows.filter(r=>(r.country||'')=== lbCountryFilter) : lbAllRows;
    const activeRows = isPro ? proRows : lbRows;
    const positions = [...new Set(activeRows.map(r=>r.position).filter(Boolean))].sort();
    const rows = financePositionFilter
      ? activeRows.filter(r=>r.position===financePositionFilter)
      : activeRows;
    // Pro stats (KES)
    const proFin = financePositionFilter ? proRows.filter(r=>r.position===financePositionFilter) : proRows;
    const proTotal = proFin.reduce((s,r)=>s+r.commission,0);
    const proPaid  = proFin.reduce((s,r)=>s+r.paid,0);
    const proBal   = proFin.reduce((s,r)=>s+r.balance,0);
    const proDueNow = proFin.reduce((s,r)=>s+(Number(r.dueNow)||0),0);
    const proRate  = proTotal ? Math.round(proPaid/proTotal*100) : 0;
    // LB stats (USD) — only post-travel candidates have real outstanding balances
    const lbFin = financePositionFilter ? lbRows.filter(r=>r.position===financePositionFilter) : lbRows;
    const lbTravelled = lbFin.filter(r => LB_TRAVELLED_STAGES.has(String(r.stage||'').toUpperCase()));
    const lbPreTravel = lbFin.filter(r => !LB_TRAVELLED_STAGES.has(String(r.stage||'').toUpperCase())&&!r.own_passport);
    const lbTotal   = lbTravelled.reduce((s,r)=>s+r.commission,0); // total refund commitment (post-travel only)
    const lbPaidAmt = lbFin.reduce((s,r)=>s+r.paid,0);            // all refunds received
    const lbBal     = lbTravelled.reduce((s,r)=>s+r.balance,0);   // outstanding only for travelled
    const lbExpected = lbPreTravel.reduce((s,r)=>s+r.commission,0); // pre-travel expected
    const lbOwnPP   = lbFin.filter(r=>r.own_passport).length;
    const lbPipeline = lbPreTravel.length; // pre-travel, expected future refunds
    const total = rows.reduce((s,r)=>s+r.commission,0);
    const paid  = rows.reduce((s,r)=>s+r.paid,0);
    const bal   = rows.reduce((s,r)=>s+r.balance,0);
    const rate  = proRate;

    // Monthly breakdown (last 6 months, by r.submitted or created_at)
    const now = new Date();
    const months = Array.from({length:6},(_,i)=>{
      const d = new Date(now.getFullYear(), now.getMonth()-5+i, 1);
      return { label: d.toLocaleString('default',{month:'short'})+' '+d.getFullYear().toString().slice(2), y: d.getFullYear(), m: d.getMonth() };
    });
    const monthly = months.map(({label,y,m}) => {
      const mrs = rows.filter(r=>{
        const d = new Date(r.submitted||r.created_at||'');
        return !isNaN(d) && d.getFullYear()===y && d.getMonth()===m;
      });
      return { label, invoiced: mrs.reduce((s,r)=>s+r.commission,0), paid: mrs.reduce((s,r)=>s+r.paid,0) };
    });

    // Outstanding by company
    const byPosition = {};
    rows.filter(r=>r.balance>0).forEach(r => {
      const pos = r.position || 'Unknown Position';
      if (!byPosition[pos]) byPosition[pos] = {name:pos,balance:0,count:0};
      byPosition[pos].balance += r.balance;
      byPosition[pos].count++;
    });
    const positionDebt = Object.values(byPosition).sort((a,b)=>b.balance-a.balance);

    // Date range preset filter
    const now2 = new Date();
    function inPreset(r) {
      const d = new Date(r.submitted || r.created_at || '');
      if (isNaN(d) || financeDatePreset === 'all') return true;
      const y = d.getFullYear(), mo = d.getMonth();
      if (financeDatePreset === 'this_month') return y === now2.getFullYear() && mo === now2.getMonth();
      if (financeDatePreset === 'last_month') { const lm = new Date(now2.getFullYear(), now2.getMonth()-1,1); return y === lm.getFullYear() && mo === lm.getMonth(); }
      if (financeDatePreset === 'this_quarter') { const q = Math.floor(now2.getMonth()/3); return y === now2.getFullYear() && Math.floor(mo/3) === q; }
      if (financeDatePreset === 'this_year') return y === now2.getFullYear();
      return true;
    }
    const dateRows = rows.filter(inPreset);
    // Expand to per-payment entries for "latest" tab
    const paymentEntries = [];
    dateRows.forEach(r => {
      if (r.type === 'pro') {
        if (r.paid1 > 0) paymentEntries.push({ r, label: `${r.name} — 1st Commission`, amt: r.paid1, date: r.paid1_date || r.interview || r.submitted || r.created_at, slot: 'paid1_date', isUSD: false });
        if (r.paid2 > 0) paymentEntries.push({ r, label: `${r.name} — 2nd Commission`, amt: r.paid2, date: r.paid2_date || r.ol || r.submitted || r.created_at, slot: 'paid2_date', isUSD: false });
        if (!r.paid1 && !r.paid2 && r.paid > 0) paymentEntries.push({ r, label: `${r.name} — Commission`, amt: r.paid, date: r.submitted || r.created_at, slot: null, isUSD: false });
      } else {
        const r1 = Number(r.r1Amt)||0, r2 = Number(r.r2Amt)||0;
        if (r1 > 0) paymentEntries.push({ r, label: `${r.name} — 1st Refund`, amt: r1, date: r.r1Date || r.travelDate || r.submitted || r.created_at, slot: 'r1Date', isUSD: true });
        if (r2 > 0) paymentEntries.push({ r, label: `${r.name} — 2nd Refund`, amt: r2, date: r.r2Date || r.travelDate || r.submitted || r.created_at, slot: 'r2Date', isUSD: true });
        if (!r1 && !r2 && r.paid > 0) paymentEntries.push({ r, label: `${r.name} — Refund`, amt: r.paid, date: r.travelDate || r.submitted || r.created_at, slot: null, isUSD: true });
      }
    });
    paymentEntries.sort((a,b) => new Date(b.date||0) - new Date(a.date||0));
    const upcomingRows = dateRows
      .filter(r => r.type === 'pro' ? (Number(r.dueNow)||0) > 0 : r.balance > 0)
      .sort((a,b) => (b.type === 'pro' ? Number(b.dueNow)||0 : b.balance) - (a.type === 'pro' ? Number(a.dueNow)||0 : a.balance));
    const searchQ = financeClientSearch.trim().toLowerCase();
    const filteredPayments = searchQ ? paymentEntries.filter(e => e.label.toLowerCase().includes(searchQ) || (e.r.company||'').toLowerCase().includes(searchQ)) : paymentEntries;
    const filteredUpcoming = searchQ ? upcomingRows.filter(r => (r.name||'').toLowerCase().includes(searchQ) || (r.company||'').toLowerCase().includes(searchQ)) : upcomingRows;
    const txRows = financeTab === 'latest' ? filteredPayments : filteredUpcoming;
    const presets = [
      ['all','All Time'],['this_month','This Month'],['last_month','Last Month'],
      ['this_quarter','This Quarter'],['this_year','This Year']
    ];
    const now3 = new Date();
    const sevenDaysAgo = new Date(now3.getTime() - 7*86400000);
    const currMonthStart = new Date(now3.getFullYear(), now3.getMonth(), 1);
    const weeklyPaid = rows.reduce((s,r) => { const d=new Date(r.submitted||r.created_at||''); return !isNaN(d as any)&&d>=sevenDaysAgo?s+r.paid:s; }, 0);
    const monthlyPaid = rows.reduce((s,r) => { const d=new Date(r.submitted||r.created_at||''); return !isNaN(d as any)&&d>=currMonthStart?s+r.paid:s; }, 0);
    const TX_CAP = 8;

    el.innerHTML = `
      <div class="dv5-page">
        <div class="dv5-page-head">
          <div><h1>Finance</h1><p>${isPro?'Professional commissions — KES.':'General Jobs refunds — USD.'}</p></div>
          <div class="dv5-head-actions">
            ${jobTypeTabs()}
            <input class="dv5-input" placeholder="Search client…" value="${h(financeClientSearch)}" oninput="window.setFinanceClientSearch(this.value)" style="min-width:150px">
            <select class="dv5-select" onchange="setFinancePosition(this.value)" style="min-width:130px">
              <option value="">All Positions</option>
              ${positions.map(c=>`<option value="${h(c)}" ${financePositionFilter===c?'selected':''}>${h(c)}</option>`).join('')}
            </select>
            <button class="dv5-btn" onclick="exportCSV('${isPro?'pro':'lb'}')"><i class="ti ti-download"></i>Export</button>
          </div>
        </div>
        ${!isPro ? lbCountryBar(lbDB||[]) : ''}

        <div class="dv5-stat-grid" style="margin-bottom:20px;margin-top:12px">
          ${isPro ? `
            ${statCard('ti-receipt',      money(proTotal), 'Total Commission',  `${proFin.length} candidates`,     '#EDE8FB','#4825B8','#fff')}
            ${statCard('ti-wallet',       money(proPaid),  'Collected KES',     'Revenue received',                '#DCFCE7','#16A34A','#fff')}
            ${statCard('ti-alert-circle', money(proDueNow), 'Due Now KES',       `${proFin.filter(r=>r.dueNow>0).length} stage-triggered accounts`, '#FCECEA','#8B2010','#fff')}
            ${statCard('ti-file-invoice', money(proBal),   'Total Balance KES', `${proFin.filter(r=>r.balance>0).length} open accounts`, '#FEF9C3','#A16207','#fff')}
            ${statCard('ti-chart-pie',    proRate+'%',     'Collection Rate',   'Paid vs invoiced',                '#EDFAA8','#5A7A10','#fff')}
            ${statCard('ti-cash',         money(expTotal), 'Expenses',          `${expenses.length} entries · ${money(expMonthTotal)} this month`, '#EDEDFB','#252677','#fff', "window.setFinanceTab('expenses');window.renderFinancePage()")}
          ` : `
            ${statCard('ti-wallet',       moneyUSD(lbPaidAmt),   'Refunds Collected',  'Received so far',                                          '#DCFCE7','#16A34A','#fff')}
            ${statCard('ti-alert-circle', moneyUSD(lbBal),      'Outstanding USD',    `${lbTravelled.filter(r=>r.balance>0).length} post-travel unpaid`, '#FCECEA','#8B2010','#fff')}
            ${statCard('ti-receipt',      moneyUSD(lbTotal),    'Collected + Owed',   `${lbTravelled.length} have travelled`,                            '#EDE8FB','#4825B8','#fff')}
            ${statCard('ti-clock',        moneyUSD(lbExpected), 'Expected (Pipeline)',`${lbPipeline} pre-travel candidates`,                             '#EDEDFB','#252677','#fff')}
          `}
        </div>

        <div class="dv5-two-col" style="margin-bottom:16px">
          <!-- Latest Transactions (capped) -->
          <div class="dv5-card" style="padding:0;overflow:hidden">
            <div class="dv5-card-head" style="padding:16px 18px 14px">
              <div>
                <span class="dv5-card-title">Latest Transactions</span>
                <div class="dv5-card-sub">${filteredPayments.length} records${searchQ?' (filtered)':''}</div>
              </div>
              <button style="width:32px;height:32px;border-radius:8px;background:#0D9488;border:0;color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0" onclick="openRecordPaymentPrompt('${isPro?'commission':'repayment'}')" title="Record payment"><i class="ti ti-plus"></i></button>
            </div>
            <div style="border-top:1px solid var(--border,#E8E8E8)">
              ${(financeShowAllTx ? filteredPayments : filteredPayments.slice(0,TX_CAP)).map(({r, amt, date, slot, isUSD}) => {
                const d = new Date(date||'');
                const dateStr = isNaN(d as any) ? '—' : d.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
                const dateVal = date ? String(date).slice(0,10) : '';
                const amtStr = '+' + (isUSD ? moneyUSD(amt) : money(amt));
                const editFn = r.type==='pro' ? `editPro(${r.id})` : `editLB(${r.id})`;
                const dateEditArea = slot
                  ? `<div style="min-width:64px;font-size:11px;color:#9ca3af;flex-shrink:0;display:flex;align-items:center;gap:3px" onclick="event.stopPropagation()">
                      <span>${dateStr}</span>
                      <label title="Edit date" style="cursor:pointer;display:inline-flex;align-items:center;color:#c4b5fd;position:relative">
                        <i class="ti ti-calendar-edit" style="font-size:12px;pointer-events:none"></i>
                        <input type="date" value="${dateVal}" style="position:absolute;inset:0;opacity:0;cursor:pointer" onchange="event.stopPropagation();window.updateTxDate('${r.type}','${r.id}','${slot}',this.value)">
                      </label>
                    </div>`
                  : `<div style="min-width:64px;font-size:11px;color:#9ca3af;flex-shrink:0">${dateStr}</div>`;
                return `<div style="display:flex;align-items:center;gap:10px;padding:11px 18px;border-bottom:1px solid var(--border,#F1F1F1);cursor:pointer;transition:background .1s" onclick="${editFn}" onmouseenter="this.style.background='#F9F9F9'" onmouseleave="this.style.background=''">
                  ${dateEditArea}
                  <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:500;color:#18191B;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(r.name||'—')}</div>
                    <div style="font-size:11px;color:#9ca3af;margin-top:1px">${h(r.company||r.position||'—')}</div>
                  </div>
                  <span class="dv5-badge ${r.type==='pro'?'teal':'blue'}" style="font-size:10px;padding:2px 7px;flex-shrink:0">${r.type==='pro'?'Commission':'Refund'}</span>
                  <div style="font-size:13px;font-weight:600;color:#16a34a;flex-shrink:0;white-space:nowrap;min-width:0">${amtStr}</div>
                  <button style="width:26px;height:26px;border:1px solid var(--border,#E8E8E8);border-radius:7px;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;color:#9ca3af" onclick="event.stopPropagation();${editFn}"><i class="ti ti-chevron-right" style="font-size:12px"></i></button>
                </div>`;
              }).join('') || '<div class="dv5-empty" style="padding:32px">No payments recorded.</div>'}
            </div>
            ${!financeShowAllTx && filteredPayments.length > TX_CAP ? `
            <div style="display:flex;align-items:center;justify-content:center;padding:12px 0;border-top:1px solid var(--border,#E8E8E8)">
              <button onclick="window.setFinanceShowAllTx(true)" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:500;color:#374151;background:none;border:0;cursor:pointer;padding:4px 12px;border-radius:8px">See more <i class="ti ti-arrow-right" style="font-size:12px"></i></button>
            </div>` : ''}
          </div>

          <!-- Collections Breakdown (donut) -->
          <div class="dv5-card" style="padding:0;overflow:hidden">
            <div class="dv5-card-head" style="padding:16px 18px 14px">
              <div>
                <span class="dv5-card-title">${isPro?'Commission':'Refund'} Breakdown</span>
                <div class="dv5-card-sub">by position · ${isPro?money(paid):moneyUSD(paid)} collected</div>
              </div>
              <button style="width:32px;height:32px;border-radius:8px;background:#0D9488;border:0;color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0" onclick="openRecordPaymentPrompt('${isPro?'commission':'repayment'}')" title="Record payment"><i class="ti ti-plus"></i></button>
            </div>
            <div style="display:flex;border-top:1px solid var(--border,#E8E8E8);border-bottom:1px solid var(--border,#E8E8E8)">
              <div style="flex:1;padding:14px 18px;border-right:1px solid var(--border,#E8E8E8)">
                <div style="font-size:10px;font-weight:500;color:#9ca3af;margin-bottom:4px;letter-spacing:.04em">weekly</div>
                <div style="font-size:14px;font-weight:600;color:#18191B">${isPro?money(weeklyPaid):moneyUSD(weeklyPaid)}</div>
              </div>
              <div style="flex:1;padding:14px 18px;border-right:1px solid var(--border,#E8E8E8)">
                <div style="font-size:10px;font-weight:500;color:#9ca3af;margin-bottom:4px;letter-spacing:.04em">monthly</div>
                <div style="font-size:14px;font-weight:600;color:#18191B">${isPro?money(monthlyPaid):moneyUSD(monthlyPaid)}</div>
              </div>
              <div style="flex:1;padding:14px 18px">
                <div style="font-size:10px;font-weight:500;color:#9ca3af;margin-bottom:4px;letter-spacing:.04em">all time</div>
                <div style="font-size:14px;font-weight:600;color:#18191B">${isPro?money(paid):moneyUSD(paid)}</div>
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 18px 6px">
              <span style="font-size:12px;font-weight:500;color:#374151">${(presets.find(([v])=>v===financeDatePreset)||['','All Time'])[1]}</span>
              <select class="dv5-select" style="font-size:11px;height:28px;padding:0 8px;min-width:0;width:auto" onchange="window.setFinanceDatePreset(this.value)">
                ${presets.map(([val,label])=>`<option value="${val}"${financeDatePreset===val?' selected':''}>${label}</option>`).join('')}
              </select>
            </div>
            <div style="padding:4px 18px 18px">${buildFinanceDonut(filteredPayments, isPro)}</div>
          </div>
        </div>

        <!-- Outstanding Balances -->
        ${positionDebt.length ? `<div class="dv5-card" style="margin-bottom:16px;padding:0;overflow:hidden">
          <div class="dv5-card-head" style="padding:14px 18px">
            <span class="dv5-card-title">Outstanding Balances</span>
            <span class="dv5-card-sub">${isPro?money(bal):moneyUSD(bal)}</span>
          </div>
          <div class="dv5-task-list" style="padding:0 12px 8px;border-top:1px solid var(--border,#E8E8E8)">
            ${positionDebt.slice(0,6).map(c=>`
              <div class="dv5-task-item" onclick="setFinancePosition('${js(c.name)}')">
                <div class="dv5-task-icon high"><i class="ti ti-briefcase"></i></div>
                <div class="dv5-task-body">
                  <div class="dv5-task-title">${h(c.name)}</div>
                  <div class="dv5-task-meta">${c.count} candidate${c.count!==1?'s':''}</div>
                </div>
                <span class="dv5-pill red">${isPro?money(c.balance):moneyUSD(c.balance)}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}

      </div>`;
  }
  window.renderFinancePage = renderFinance;

  // ── 6. DOCUMENTS ──────────────────────────────────────────

  function renderDocuments() {
    const el = document.getElementById('documents-section'); if (!el) return;
    const isPro = jobTypeTab === 'pro';
    const type  = isPro ? 'pro' : 'lb';
    const lbBase = lbCountryFilter ? (lbDB||[]).filter(r=>(r.country||'')===lbCountryFilter) : (lbDB||[]);
    const rows = isPro ? (proDB||[]).map(r=>({...r,type:'pro'})) : lbBase.map(r=>({...r,type:'lb'}));

    const getCandidateDocs = (t, id) => (typeof window.drecoCandidateDocs === 'function') ? (window.drecoCandidateDocs(t, id) || {}) : {};
    const defs = (typeof window.drecoDocDefs === 'function') ? window.drecoDocDefs(type) : [];
    const fmtBytes = n => { n=Number(n||0); if(!n) return ''; if(n<1024) return n+'B'; if(n<1048576) return (n/1024).toFixed(1)+'KB'; return (n/1048576).toFixed(1)+'MB'; };
    const fmtDate  = v => { if(!v) return ''; const d=new Date(v); return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}); };

    // Per-category: which candidates have each doc type
    const categories = defs.map(([key, label]) => {
      const holders = rows.map(r => {
        const items = getCandidateDocs(r.type, r.id);
        return items[key] ? { ...r, docMeta: items[key] } : null;
      }).filter(Boolean);
      return { key, label, holders };
    });

    // Summary counts
    const withAny   = rows.filter(r => typeof window.hasDocs === 'function' && window.hasDocs(r.type, r.id));
    const withNone  = rows.filter(r => !(typeof window.hasDocs === 'function' && window.hasDocs(r.type, r.id)));
    const totalFiles = rows.reduce((sum, r) => {
      const c = typeof window.drecoDocCompletion === 'function' ? window.drecoDocCompletion(r.type, r.id) : {done:0};
      return sum + c.done;
    }, 0);

    const categoryHTML = categories.map(({ key, label, holders }) => `
      <div class="dv5-doc-category">
        <div class="dv5-card-head">
          <span class="dv5-card-title"><i class="ti ti-file" style="font-size:14px;margin-right:6px;color:var(--dreco-ink,#1A1C2E)"></i>${h(label)}</span>
          <span class="dv5-card-sub">${holders.length} of ${rows.length} candidate${rows.length===1?'':'s'}</span>
        </div>
        ${holders.length === 0
          ? `<div class="dv5-doc-empty">No uploads yet</div>`
          : `<div class="dv5-doc-holders">${holders.map(r => `
              <div class="dv5-doc-holder-row" onclick="openCandidateProfile('${r.type}',${r.id})">
                ${avatar(r.name, r.type, r.id)}
                <div class="dv5-doc-holder-info">
                  <div class="dv5-name">${h(r.name)}</div>
                  <div class="dv5-sub">${h(r.docMeta.fileName||'')}${r.docMeta.size ? ' · '+fmtBytes(r.docMeta.size) : ''}</div>
                </div>
                <div class="dv5-doc-holder-meta">
                  <div>${h(r.docMeta.uploadedBy||'')}</div>
                  <div>${fmtDate(r.docMeta.uploadedAt)}</div>
                </div>
                <button class="dv5-action-btn" onclick="event.stopPropagation();window.drecoViewDoc('${r.type}','${r.id}','${key}')"><i class="ti ti-eye"></i> View</button>
                <button class="dv5-action-btn" onclick="event.stopPropagation();window.openDocs('${r.type}',${r.id},'${js(r.name)}')"><i class="ti ti-upload"></i> Manage</button>
              </div>`).join('')}
            </div>`
        }
      </div>`).join('');

    const noneHTML = withNone.length ? `
      <div class="dv5-doc-category">
        <div class="dv5-card-head">
          <span class="dv5-card-title" style="color:#9ca3af"><i class="ti ti-folder-off" style="font-size:14px;margin-right:6px"></i>No uploads yet</span>
          <span class="dv5-card-sub">${withNone.length} candidate${withNone.length===1?'':'s'}</span>
        </div>
        <div class="dv5-doc-holders">${withNone.map(r => `
          <div class="dv5-doc-holder-row" onclick="openCandidateProfile('${r.type}',${r.id})">
            ${avatar(r.name, r.type, r.id)}
            <div class="dv5-doc-holder-info">
              <div class="dv5-name">${h(r.name)}</div>
              <div class="dv5-sub">${h(r.company||r.country||'')}</div>
            </div>
            <div class="dv5-doc-holder-meta"></div>
            <button class="dv5-action-btn" onclick="event.stopPropagation();window.openDocs('${r.type}',${r.id},'${js(r.name)}')"><i class="ti ti-upload"></i> Upload</button>
          </div>`).join('')}
        </div>
      </div>` : '';

    el.innerHTML = `
      <div class="dv5-page">
        <div class="dv5-page-head">
          <div><h1>Documents</h1><p>${isPro ? 'Professional candidates' : 'General Jobs candidates'}</p></div>
          <div class="dv5-head-actions">${jobTypeTabs()}</div>
        </div>
        ${!isPro ? lbCountryBar(lbDB||[]) : ''}
        <div class="dv5-file-grid">
          ${fileCard('ti-files',        '#4825B8', '#EDE8FB', '#AE9CF0', 'Files Uploaded', totalFiles,    defs.length*Math.max(rows.length,1), `Across all candidates`,          '')}
          ${fileCard('ti-folder-check', '#4A5E10', '#EDFAA8', '#C9F035', 'With Documents', withAny.length,  rows.length,                        `${withAny.length} have uploads`, '')}
          ${fileCard('ti-folder-off',   '#8B2010', '#FCECEA', '#F9B3AA', 'Awaiting Upload', withNone.length, rows.length,                       `No uploads yet`,                 '')}
        </div>
        <div class="dv5-doc-library">
          ${categoryHTML}
          ${noneHTML}
        </div>
      </div>`;
  }
  window.renderDocumentsPage = renderDocuments;

  // ── 7. REPORTS ────────────────────────────────────────────
  function renderReports() {
    const el = document.getElementById('reports-section'); if (!el) return;
    const now = new Date();
    const isPro = jobTypeTab === 'pro';
    const allReportRows = allRows();
    const lbBase = lbCountryFilter ? allReportRows.filter(r=>r.type==='lb'&&(r.country||'')===lbCountryFilter) : allReportRows.filter(r=>r.type==='lb');
    const rows = isPro ? allReportRows.filter(r=>r.type==='pro') : lbBase;
    const fmt2 = v => isPro ? money(v) : moneyUSD(v);
    const total = rows.reduce((s,r)=>s+r.commission,0);
    const paid  = rows.reduce((s,r)=>s+r.paid,0);
    const stageCounts = {};
    rows.forEach(r => stageCounts[r.stage] = (stageCounts[r.stage]||0)+1);
    const travelled = rows.filter(r=>String(r.stage).toUpperCase()==='TRAVELLED');

    // Pro: top jobs by position
    const jobCounts = {};
    if (isPro) {
      rows.forEach(r => {
        if (r.position) { jobCounts[r.position] = jobCounts[r.position]||{count:0,travelled:0,commission:0}; jobCounts[r.position].count++; if(r.stage==='TRAVELLED') jobCounts[r.position].travelled++; jobCounts[r.position].commission+=Number(r.commission)||0; }
      });
    }
    const topJobs = Object.entries(jobCounts).sort((a,b)=>b[1].count-a[1].count).slice(0,5);

    // General: top countries
    const countryCounts = {};
    if (!isPro) {
      lbBase.forEach(r => {
        const c = r.country||'Unknown';
        countryCounts[c] = countryCounts[c]||{count:0,travelled:0,toRefund:0};
        countryCounts[c].count++; if(r.stage==='TRAVELLED') countryCounts[c].travelled++; countryCounts[c].toRefund+=Number(r.commission)||0;
      });
    }
    const topCountries = Object.entries(countryCounts).sort((a,b)=>b[1].count-a[1].count).slice(0,5);

    // Avg processing (Pro: intake→travel; LB: submit→travel)
    let avgProcessing = '—';
    if (isPro) {
      const withDates = (proDB||[]).filter(r => proPipelineStageValue(r)==='TRAVELLED' && r.travel && r.submitted);
      if (withDates.length) { const avg = Math.round(withDates.reduce((s,r)=>s+Math.max(0,(new Date(r.travel)-new Date(r.submitted))/86400000),0)/withDates.length); avgProcessing = avg>0?avg+' days':'—'; }
    } else {
      const withDates = lbBase.filter(r=>r.stage==='TRAVELLED'&&r.travelDate&&r.created_at);
      if (withDates.length) { const avg = Math.round(withDates.reduce((s,r)=>s+Math.max(0,(new Date(r.travelDate)-new Date(r.created_at))/86400000),0)/withDates.length); avgProcessing = avg>0?avg+' days':'—'; }
    }

    // Clients for this type
    const cMap2 = new Map();
    rows.forEach(r => { const n=r.company||'Unassigned'; const c=cMap2.get(n)||{name:n,country:r.country||'—',total:0,due:0}; c.total++;c.due+=r.balance;cMap2.set(n,c); });
    const topClients2 = [...cMap2.values()].sort((a,b)=>b.total-a.total).slice(0,8);

    // Monthly placements chart (last 12 months)
    const last12 = Array.from({length:12},(_,i)=>{ const d=new Date(now.getFullYear(),now.getMonth()-11+i,1); return {label:d.toLocaleString('default',{month:'short'})+' '+d.getFullYear().toString().slice(2),y:d.getFullYear(),m:d.getMonth(),count:0}; });
    rows.forEach(r=>{
      if(String(r.stage||'').toUpperCase()!=='TRAVELLED') return;
      const travelField = isPro ? (r.raw?.travel||r.travel) : (r.travelDate||r.travel_date);
      const d=travelField?new Date(travelField):null; if(!d||isNaN(d)) return;
      const slot=last12.find(s=>s.y===d.getFullYear()&&s.m===d.getMonth()); if(slot) slot.count++;
    });
    const chartMax=Math.max(...last12.map(s=>s.count),1);
    const monthlyChart=`<div style="overflow-x:auto"><div style="display:flex;align-items:flex-end;gap:3px;height:140px;padding:0 4px 4px;min-width:480px">
      ${last12.map(s=>{
        const pct=Math.max(Math.round(s.count/chartMax*100),s.count>0?5:2);
        const barColor=s.count>0?'linear-gradient(180deg,#AE9CF0,#C5C7F0)':'#F0F0F0';
        return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;height:100%;justify-content:flex-end;gap:3px">
          <div class="dv5-mp-bar" data-tip="${s.label}: ${s.count}" style="width:100%;border-radius:4px 4px 2px 2px;background:${barColor};height:${pct}%;min-height:2px"></div>
          <span style="font-size:8px;color:#999;font-weight:438;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;text-align:center">${s.label.split(' ')[0]}</span>
        </div>`;
      }).join('')}
    </div></div>`;

    // Avg days per stage (Pro only)
    let stageTimeHTML = '';
    if (isPro) {
      const stageFields = [
        ['SUBMITTED→INTERVIEW',    r=>r.interview&&r.submitted,      r=>(new Date(r.interview)-new Date(r.submitted))/86400000],
        ['INTERVIEW→OFFER',        r=>r.ol&&r.interview,             r=>(new Date(r.ol)-new Date(r.interview))/86400000],
        ['OFFER→MEDICAL',          r=>r.medical&&r.ol,               r=>(new Date(r.medical)-new Date(r.ol))/86400000],
        ['MEDICAL→PERMIT',         r=>r.mol&&r.medical,              r=>(new Date(r.mol)-new Date(r.medical))/86400000],
        ['PERMIT→VISA',            r=>r.visa&&r.mol,                 r=>(new Date(r.visa)-new Date(r.mol))/86400000],
        ['VISA→TRAVEL',            r=>r.travel&&r.visa,              r=>(new Date(r.travel)-new Date(r.visa))/86400000],
      ];
      const stageTimes = stageFields.map(([label,filter,calc])=>{
        const subset=(proDB||[]).filter(r=>{ try{return filter(r)&&!isNaN(new Date(r.travel||r.visa||r.ol||r.submitted))}catch{return false;}});
        const vals=subset.map(r=>{try{return calc(r);}catch{return 0;}}).filter(v=>v>0&&v<365);
        const avg=vals.length?Math.round(vals.reduce((s,v)=>s+v,0)/vals.length):null;
        return {label,avg,n:vals.length};
      });
      stageTimeHTML=`<div class="dv5-card" style="margin-top:16px">
        <div class="dv5-card-head"><span class="dv5-card-title">Average Days Per Stage</span><span class="dv5-card-sub">Professional placements</span></div>
        <div class="dv5-table-wrap"><table class="dv5-table">
          <thead><tr><th>Stage Transition</th><th>Avg Days</th><th>Sample Size</th></tr></thead>
          <tbody>${stageTimes.map(s=>`<tr><td>${h(s.label)}</td><td>${s.avg!=null?s.avg+' days':'—'}</td><td>${s.n} candidates</td></tr>`).join('')}</tbody>
        </table></div>
      </div>`;
    }

    el.innerHTML = `
      <div class="dv5-page">
        <div class="dv5-page-head">
          <div><h1>Reports</h1><p>${isPro?'Professional performance — KES commissions.':'General Jobs performance — USD refunds.'}</p></div>
          <div class="dv5-head-actions">
            ${jobTypeTabs()}
            <button class="dv5-btn" onclick="exportCSV('${isPro?'pro':'lb'}')"><i class="ti ti-download"></i>Export</button>
          </div>
        </div>
        ${!isPro ? lbCountryBar(lbDB||[]) : ''}
        <div class="dv5-stat-grid" style="margin-top:12px">
          ${statCard('ti-users',     rows.length,       isPro?'Professional':'General Jobs',`Total candidates`,                             '#EFF6FF','#2563EB','#fff')}
          ${statCard('ti-plane',     travelled.length,  'Travelled',        `Successful placements`,                                       '#F0FDF4','#16A34A','#fff')}
          ${statCard('ti-target',    rows.length?Math.round(travelled.length/rows.length*100)+'%':'0%','Success Rate','Travelled / total', '#F4F4EC','#372514','#fff')}
          ${statCard('ti-chart-line',total?Math.round(paid/total*100)+'%':'0%',isPro?'Collection Rate':'Refund Rate',isPro?'Finance health':'Refunds collected','#FFFBEB','#D97706','#fff')}
          ${statCard('ti-clock',     avgProcessing,     'Avg Processing',   'Submission → travel',                                        '#F0FDFA','#0D9488','#fff')}
        </div>
        <div class="dv5-card" style="margin-top:16px">
          <div class="dv5-card-head"><span class="dv5-card-title">Monthly Placements (Last 12 Months)</span></div>
          <div style="padding:12px 16px 0">${monthlyChart}</div>
        </div>
        <div class="dv5-two-col" style="margin-top:16px">
          <div class="dv5-card">
            <div class="dv5-card-head"><span class="dv5-card-title">Candidates by Stage</span></div>
            <div class="dv5-task-list">
              ${Object.entries(stageCounts).map(([s,c]) => `
                <div class="dv5-task-item">
                  <div class="dv5-task-icon med"><i class="ti ti-chart-pie"></i></div>
                  <div class="dv5-task-body">
                    <div class="dv5-task-title">${h(s)}</div>
                    <div class="dv5-task-meta">${c} candidates</div>
                  </div>
                  <span class="dv5-pill">${Math.round(c/Math.max(rows.length,1)*100)}%</span>
                </div>`).join('')}
            </div>
          </div>
          <div class="dv5-card">
            <div class="dv5-card-head"><span class="dv5-card-title">Top ${isPro?'Companies':'Countries'}</span></div>
            <div class="dv5-task-list">
              ${isPro ? (topClients2.length ? topClients2.map(c=>`
                <div class="dv5-task-item" onclick="setCandidateSearch('${js(c.name)}');switchTab('candidates')" style="cursor:pointer">
                  <div class="dv5-task-icon med"><i class="ti ti-building"></i></div>
                  <div class="dv5-task-body">
                    <div class="dv5-task-title">${h(c.name)}</div>
                    <div class="dv5-task-meta">${c.total} candidates · ${fmt2(c.due)} due</div>
                  </div>
                  <span class="dv5-pill">${h(c.country)}</span>
                </div>`).join('') : '<div class="dv5-empty">No company data yet.</div>')
              : (topCountries.length ? topCountries.map(([country,d])=>`
                <div class="dv5-task-item" onclick="window.setLbCountry('${js(country)}')" style="cursor:pointer">
                  <div class="dv5-task-icon med"><i class="ti ti-globe"></i></div>
                  <div class="dv5-task-body">
                    <div class="dv5-task-title">${h(country)}</div>
                    <div class="dv5-task-meta">${d.count} candidates · ${d.travelled} travelled · ${moneyUSD(d.toRefund)} refund</div>
                  </div>
                  <span class="dv5-pill">${Math.round(d.travelled/Math.max(d.count,1)*100)}%</span>
                </div>`).join('') : '<div class="dv5-empty">No country data yet.</div>')}
            </div>
          </div>
        </div>
        ${isPro ? `<div class="dv5-card" style="margin-top:16px">
          <div class="dv5-card-head"><span class="dv5-card-title">Top Performing Jobs</span></div>
          <div class="dv5-table-wrap">
            <table class="dv5-table">
              <thead><tr><th>#</th><th>Position</th><th>Candidates</th><th>Travelled</th><th>Success Rate</th><th>Commission</th></tr></thead>
              <tbody>
                ${topJobs.length ? topJobs.map(([pos,d],i)=>`<tr>
                  <td>${i+1}</td><td>${h(pos)}</td><td>${d.count}</td><td>${d.travelled}</td>
                  <td>${d.count?Math.round(d.travelled/d.count*100)+'%':'—'}</td><td>${money(d.commission)}</td>
                </tr>`).join('') : '<tr><td colspan="6"><div class="dv5-empty">No job data yet.</div></td></tr>'}
              </tbody>
            </table>
          </div>
        </div>${stageTimeHTML}` : ''}
      </div>`;
  }
  window.renderReportsPage = renderReports;

  // ── 8. CLIENTS ────────────────────────────────────────────
  let expandedClient = null;

  function renderClients() {
    const el = document.getElementById('clients-section'); if (!el) return;
    const isPro = jobTypeTab === 'pro';
    const lbBase = lbCountryFilter ? (lbDB||[]).filter(r=>(r.country||'')=== lbCountryFilter) : (lbDB||[]);
    const sourceRows = isPro ? (proDB||[]).map(r=>({...r,type:'pro'})) : lbBase.map(r=>({...r,type:'lb'}));
    const fmt2 = v => isPro ? money(v) : moneyUSD(v);

    // Build clients from sourceRows only
    const cMap = new Map();
    sourceRows.forEach(r => {
      const name = isPro ? (r.company || 'Unassigned') : (r.country || r.company || 'Unassigned');
      const stage = String(r.stage||r.travelStatus||r.travel_status||'').toUpperCase();
      const paid = isPro ? (Number(r.paid)||0) : (Number(r.r1Amt||r.r1_amt)||0)+(Number(r.r2Amt||r.r2_amt)||0);
      const bal  = isPro ? (Number(r.balance)||0) : balLB(r);
      const isFinished = isPro ? stage==='TRAVELLED' : LB_TRAVELLED_STAGES.has(stage);
      const c = cMap.get(name) || { name, country: r.country||'—', active:0, total:0, due:0, paid:0, manager: currentUser?.display||'Team' };
      c.total++;
      if (!isFinished) c.active++;
      c.due  += bal;
      c.paid += paid;
      cMap.set(name, c);
    });
    const clients = [...cMap.values()].sort((a,b)=>b.total-a.total);

    function clientCandidates(name) {
      const cands = sourceRows.filter(r=>(isPro?(r.company||'Unassigned'):(r.country||r.company||'Unassigned'))===name);
      if (isPro) return cands;
      return cands.map(r=>({
        ...r,
        commission: Number(r.toRefund||r.to_refund)||0,
        paid: (Number(r.r1Amt||r.r1_amt)||0)+(Number(r.r2Amt||r.r2_amt)||0),
        balance: balLB(r),
      }));
    }

    el.innerHTML = `
      <div class="dv5-page">
        <div class="dv5-page-head">
          <div><h1>Clients</h1><p>${isPro?'Professional clients — commissions in KES.':'General Jobs clients — refunds in USD.'}</p></div>
          <div class="dv5-head-actions">
            ${jobTypeTabs()}
            <button class="dv5-btn primary" onclick="${isPro?'openProForm()':'openLBForm()'}"><i class="ti ti-plus"></i>Add Candidate</button>
          </div>
        </div>
        ${!isPro ? lbCountryBar(lbDB||[]) : ''}
        <div class="dv5-stat-grid" style="margin-top:12px">
          ${statCard('ti-building',  clients.length,                              'Total Clients', `Employer companies`,    '#EFF6FF','#2563EB','#fff')}
          ${statCard('ti-briefcase', clients.reduce((s,c)=>s+c.active,0),        'Active Jobs',   `In-progress`,           '#F4F4EC','#372514','#fff')}
          ${statCard('ti-users',     clients.reduce((s,c)=>s+c.total,0),         'Total Hired',   `All-time candidates`,   '#F0FDF4','#16A34A','#fff')}
          ${statCard('ti-coin',      fmt2(clients.reduce((s,c)=>s+c.due,0)),     'Outstanding',   `Total due`,             '#FEF2F2','#DC2626','#fff')}
          ${statCard('ti-wallet',    fmt2(clients.reduce((s,c)=>s+c.paid,0)),    'Collected',     `Total paid`,            '#FEF9C3','#A16207','#fff')}
        </div>
        <div class="dv5-table-card">
          <div class="dv5-table-wrap">
            <table class="dv5-table">
              <thead><tr><th></th><th>Client Name</th><th>Country</th><th>Active</th><th>Total</th><th>Outstanding</th><th>Collected</th></tr></thead>
              <tbody>
                ${clients.length ? clients.map(c => {
                  const isOpen = expandedClient === c.name;
                  const cands  = isOpen ? clientCandidates(c.name) : [];
                  return `
                  <tr class="dv5-client-row${isOpen?' dv5-client-open':''}" onclick="window._toggleClient('${js(c.name)}')" style="cursor:pointer">
                    <td style="width:28px"><i class="ti ${isOpen?'ti-chevron-down':'ti-chevron-right'}" style="font-size:12px;color:#9ca3af"></i></td>
                    <td><div class="dv5-name-cell">
                      <div class="dv5-avatar" style="background:#E4E1D6;color:#76746B"><i class="ti ti-building" style="font-size:13px"></i></div>
                      <div>
                        <div class="dv5-name">${h(c.name)}</div>
                        <div class="dv5-sub">${h(c.country||'—')}</div>
                      </div>
                    </div></td>
                    <td>${h(c.country||'—')}</td>
                    <td>${c.active}</td>
                    <td>${c.total}</td>
                    <td>${c.due>0?`<strong style="color:#b91c1c">${fmt2(c.due)}</strong>`:fmt2(0)}</td>
                    <td>${fmt2(c.paid)}</td>
                  </tr>
                  ${isOpen ? `<tr class="dv5-expand-row"><td colspan="7" style="padding:0 0 8px 40px;background:#f8fafc">
                    <table class="dv5-table" style="min-width:0;border:0;box-shadow:none">
                      <thead><tr><th>Name</th><th>${isPro?'Job Title':'Country'}</th><th>Stage</th><th>Submitted</th><th>Invoice</th><th>Balance</th><th></th></tr></thead>
                      <tbody>
                        ${cands.map(r=>`<tr>
                          <td>${h(r.name)}</td>
                          <td>${h(isPro?r.position:r.country)}</td>
                          <td>${badge(r.stage||r.travelStatus||r.travel_status)}</td>
                          <td>${h(fmt(r.submitted_date||r.submitted||r.travelDate||r.travel_date))}</td>
                          <td>${fmt2(r.commission||0)}</td>
                          <td>${r.balance>0?`<strong style="color:#b91c1c">${fmt2(r.balance)}</strong>`:fmt2(0)}</td>
                          <td><button class="dv5-action-btn" onclick="event.stopPropagation();openCandidateProfile('${r.type}',${r.id})">View</button></td>
                        </tr>`).join('')}
                      </tbody>
                    </table>
                  </td></tr>` : ''}`;
                }).join('') : '<tr><td colspan="7"><div class="dv5-empty">Clients appear automatically when you add candidates with company names.</div></td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }
  window._toggleClient = function(name) {
    expandedClient = expandedClient === name ? null : name;
    renderClients();
  };
  window.renderClientsPage = renderClients;

  // ── 9. JOBS / EMPLOYERS ───────────────────────────────────
  let expandedEmployer = null;

  function renderJobs() {
    const el = document.getElementById('jobs-section'); if (!el) return;
    const emps = employers || [];
    const jos  = jobOrders || [];
    function empJobs(eid) { return jos.filter(j=>j.employerId===eid); }
    function empCandidates(eid) {
      const emp = emps.find(e=>e.id===eid);
      if (!emp) return [];
      return (proDB||[]).filter(r=>(r.company||'').toUpperCase()===(emp.name||'').toUpperCase());
    }
    function totalCandidates(empList) {
      const names = new Set(empList.map(e=>(e.name||'').toUpperCase()));
      return (proDB||[]).filter(r=>names.has((r.company||'').toUpperCase())).length;
    }
    const totalOpen = jos.filter(j=>j.status!=='filled').length;
    const totalPositions = jos.reduce((s,j)=>s+(Number(j.positions)||1),0);
    el.innerHTML = `
      <div class="dv5-page">
        <div class="dv5-page-head">
          <div><h1>Jobs</h1><p>Employer companies and job orders for professional placements.</p></div>
          <div class="dv5-head-actions">
            <button class="dv5-btn primary" onclick="openEmployerForm()"><i class="ti ti-plus"></i>Add Employer</button>
          </div>
        </div>
        <div class="dv5-stat-grid" style="margin-top:12px">
          ${statCard('ti-building', emps.length, 'Employers', 'Registered companies', '#EFF6FF','#2563EB','#fff')}
          ${statCard('ti-list-details', jos.length, 'Job Orders', `${totalOpen} open`, '#F4F4EC','#372514','#fff')}
          ${statCard('ti-users', totalCandidates(emps), 'Linked Candidates', 'Matched by company name', '#F0FDF4','#16A34A','#fff')}
          ${statCard('ti-target', totalPositions, 'Total Positions', 'Across all job orders', '#FEF9C3','#A16207','#fff')}
        </div>
        <div class="dv5-table-card" style="margin-top:16px">
          <div class="dv5-table-wrap">
            <table class="dv5-table">
              <thead><tr><th></th><th>Employer</th><th>Country</th><th>Contact</th><th>Job Orders</th><th>Candidates</th><th></th></tr></thead>
              <tbody>
                ${emps.length ? emps.map(emp => {
                  const isOpen = expandedEmployer === emp.id;
                  const jobs = empJobs(emp.id);
                  const cands = empCandidates(emp.id);
                  return `
                  <tr class="dv5-client-row${isOpen?' dv5-client-open':''}" onclick="window._toggleEmployer(${emp.id})" style="cursor:pointer">
                    <td style="width:28px"><i class="ti ${isOpen?'ti-chevron-down':'ti-chevron-right'}" style="font-size:12px;color:#9ca3af"></i></td>
                    <td><div class="dv5-name-cell">
                      <div class="dv5-avatar" style="background:#E4E1D6;color:#76746B"><i class="ti ti-building" style="font-size:13px"></i></div>
                      <div><div class="dv5-name">${h(emp.name)}</div><div class="dv5-sub">${h(emp.notes||'—')}</div></div>
                    </div></td>
                    <td>${h(emp.country||'—')}</td>
                    <td>${h(emp.contact||'—')}</td>
                    <td><span style="background:#eff6ff;color:#2563eb;padding:2px 8px;border-radius:20px;font-size:11px">${jobs.length} order${jobs.length!==1?'s':''}</span></td>
                    <td>${cands.length}</td>
                    <td onclick="event.stopPropagation()">
                      <button class="dv5-action-btn" onclick="openEmployerForm(${emp.id})" style="margin-right:4px">Edit</button>
                      <button class="dv5-action-btn" onclick="openJobOrderForm(${emp.id})" style="margin-right:4px">+ Job</button>
                      <button class="dv5-action-btn" style="color:#b91c1c" onclick="if(confirm('Delete ${h(emp.name).replace(/'/g,"\\'")} and all its job orders?'))deleteEmployer(${emp.id})">Del</button>
                    </td>
                  </tr>
                  ${isOpen ? `<tr class="dv5-expand-row"><td colspan="7" style="padding:0 0 8px 40px;background:#f8fafc">
                    ${jobs.length ? `<table class="dv5-table" style="min-width:0;border:0;box-shadow:none">
                      <thead><tr><th>Job Title</th><th>Positions</th><th>Deadline</th><th>Notes</th><th></th></tr></thead>
                      <tbody>${jobs.map(j=>`<tr>
                        <td><strong>${h(j.title)}</strong></td>
                        <td>${j.positions||1}</td>
                        <td>${j.deadline?fmt(j.deadline):'—'}</td>
                        <td>${h(j.notes||'—')}</td>
                        <td><button class="dv5-action-btn" onclick="openJobOrderForm(${emp.id},${j.id})">Edit</button>
                            <button class="dv5-action-btn" style="color:#b91c1c;margin-left:4px" onclick="if(confirm('Delete job order?'))deleteJobOrder(${j.id})">Del</button>
                        </td>
                      </tr>`).join('')}</tbody>
                    </table>` : '<div class="dv5-empty" style="padding:10px 0">No job orders yet. <button class="dv5-action-btn" onclick="openJobOrderForm('+emp.id+')">+ Add job order</button></div>'}
                    ${cands.length ? `<div style="padding:8px 0 0;font-size:11px;color:var(--text-3)">${cands.length} candidate${cands.length!==1?'s':''} matched by company name: ${cands.slice(0,5).map(r=>h(r.name)).join(', ')}${cands.length>5?'…':''}</div>` : ''}
                  </td></tr>` : ''}`;
                }).join('') : '<tr><td colspan="7"><div class="dv5-empty">No employers yet. Add your first employer to track job orders.</div></td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>`;
  }
  window._toggleEmployer = function(id) {
    expandedEmployer = expandedEmployer === id ? null : id;
    renderJobs();
  };
  window.renderJobsPage = renderJobs;

  // ── 10. SETTINGS (pass-through to existing) ────────────────
  function renderSettings() {
    if (typeof renderSettingsPage === 'function') renderSettingsPage();
  }

  // ── CANDIDATE PROFILE PAGE ────────────────────────────────
  window.openCandidateProfile = function(type, id) {
    profileViewType = type;
    profileViewId   = String(id);
    renderCandidates();
    // Scroll to top of section
    const el = document.getElementById('candidates-section');
    if (el) el.scrollIntoView({ behavior:'smooth', block:'start' });
  };

  window.closeCandidateProfile = function() {
    profileViewType = null;
    profileViewId   = null;
    renderCandidates();
  };

  window.closeProfile = window.closeCandidateProfile;

  window.uploadCandidateAvatar = function(type, id, input) {
    const file = input?.files?.[0];
    if (!file) return;
    if (!file.type?.startsWith('image/')) {
      showToast?.('Please choose an image file.', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast?.('Candidate photo must be under 2MB.', 'error');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const avatars = readCandidateAvatars();
      avatars[candidateAvatarKey(type, id)] = String(reader.result || '');
      writeCandidateAvatars(avatars);
      try { saveLocalStore?.(); } catch {}
      try { addTimeline?.(type, id, 'Candidate photo updated'); } catch {}
      try {
        const row = allRows().find(x => x.type === type && String(x.id) === String(id));
        auditAction?.('Candidates', 'Candidate photo updated', row?.name || 'Candidate');
      } catch {}
      showToast?.('Candidate photo updated', 'success');
      renderCandidates();
    };
    reader.readAsDataURL(file);
  };

  window.removeCandidateAvatar = function(type, id) {
    const avatars = readCandidateAvatars();
    delete avatars[candidateAvatarKey(type, id)];
    writeCandidateAvatars(avatars);
    try { saveLocalStore?.(); } catch {}
    try { addTimeline?.(type, id, 'Candidate photo removed'); } catch {}
    showToast?.('Candidate photo removed', 'success');
    renderCandidates();
  };

  function renderCandidateProfilePage(el, type, id) {
    const r = allRows().find(x => x.type===type && String(x.id)===String(id));
    if (!r) { el.innerHTML = '<div class="dv5-page"><div class="dv5-empty">Candidate not found.</div></div>'; return; }

    const cl    = buildChecklist(r);
    const pct   = checklistPct(r);
    const timeline = (allTimelines?.[`${type}_${id}`]||[]).slice(0,6).reverse();
    const stageListRef = type==='pro' ? PRO_PROFILE_PROCESS : activeWorkflowStages('lb', r.country);
    const stageLabels  = type==='pro'
      ? stageListRef.map(s => PRO_PROFILE_LABELS[s] || s)
      : stageListRef.map(s => s.replace(/^DOCS /,'').replace(/_/g,' '));
    const normalizedStage = type === 'pro' ? resolveProProcessStage(r) : r.pipelineStage;
    const stageIdxRaw = stageListRef.findIndex(s => s === normalizedStage);
    const stageIdx = Math.max(0, stageIdxRaw);

    // Docs — from Document Upload IIFE (exposed on window)
    const defs  = (window.drecoDocDefs?.(type)) || [];
    const items = (window.drecoCandidateDocs?.(type, id)) || {};
    const compl = (window.drecoDocCompletion?.(type, id)) || {done:0,total:defs.length,pct:0};

    const fmt2  = type==='pro' ? money : moneyUSD;
    const health = candidateRecordHealth(r);
    const financeRemainingPct = r.commission > 0 ? Math.round((Math.max(Number(r.balance)||0, 0) / Number(r.commission)) * 100) : 0;
    const financeStatusLabel = r.balance > 0
      ? (financeRemainingPct > 0 ? `${financeRemainingPct}% outstanding` : 'Balance due')
      : 'Cleared';
    const financeStatusHint = r.balance > 0
      ? `${fmt2(r.balance)} outstanding of ${fmt2(r.commission || 0)}`
      : `${fmt2(r.paid || 0)} paid`;
    const lastActivity = timeline[0]?.ts || timeline[0]?.at || r.submitted || r.created_at || '';

    el.innerHTML = `
    <div class="dv5-page" style="padding-bottom:40px">

      <!-- Breadcrumb -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px;font-size:13px">
        <button onclick="window.closeCandidateProfile()" style="display:inline-flex;align-items:center;gap:5px;background:none;border:none;color:var(--dreco-ink,#1A1C2E);font-size:13px;font-weight:438;cursor:pointer;padding:0">
          <i class="ti ti-arrow-left"></i>Candidates
        </button>
        <i class="ti ti-chevron-right" style="font-size:12px;color:#9ca3af"></i>
        <span style="color:#18191B;font-weight:375">${h(r.name)}</span>
        <span style="margin-left:auto">${badge(normalizedStage)}</span>
      </div>

      <!-- Hero card -->
      <div class="dv5-card" style="margin-bottom:16px">
        <div style="display:flex;align-items:flex-start;gap:16px;flex-wrap:wrap">
          <label class="dv5-candidate-avatar-upload" title="Upload candidate photo">
            ${candidateAvatar(r.name, type, id, 'dv5-profile-avatar')}
            <input type="file" accept="image/*" onchange="window.uploadCandidateAvatar('${type}',${JSON.stringify(id)},this)">
            <span><i class="ti ti-camera"></i></span>
          </label>
          <div style="flex:1;min-width:0">
            <h2 style="font-size:20px;font-weight:500;color:#18191B;margin:0 0 3px">${h(r.name)}</h2>
            <div style="font-size:13px;color:#6b7280;margin-bottom:10px">${h(r.position||'—')} · ${h(r.company||r.country||'—')}</div>
            <div style="display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:#374151;font-weight:375">
              <span><i class="ti ti-map-pin" style="color:#9ca3af;margin-right:3px"></i>${h(r.country||'—')}</span>
              <span><i class="ti ti-id" style="color:#9ca3af;margin-right:3px"></i>${h(r.pp||'No passport')}</span>
              <span><i class="ti ti-phone" style="color:#9ca3af;margin-right:3px"></i>${h(r.phone||'No phone')}</span>
              ${r.owner?`<span><i class="ti ti-user" style="color:#9ca3af;margin-right:3px"></i>${h(r.owner)}</span>`:''}
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap;align-items:flex-start">
            <button class="dv5-btn" onclick="${type==='pro'?`editPro(${r.id})`:`editLB(${r.id})`}"><i class="ti ti-edit"></i>Edit</button>
            <button class="dv5-btn primary" onclick="openDocs('${type}',${JSON.stringify(r.id)},'${js(r.name)}')"><i class="ti ti-upload"></i>Upload Docs</button>
            ${candidateAvatarSrc(type, id) ? `<button class="dv5-btn" onclick="window.removeCandidateAvatar('${type}',${JSON.stringify(id)})"><i class="ti ti-photo-x"></i>Remove Photo</button>` : ''}
          </div>
        </div>
      </div>

      <!-- Vitals row -->
      <div class="dv5-profile-vitals">
        <div class="dv5-vital-card" style="background:#F8F7EF;border-color:#E4E1D6">
          <div class="dv5-vital-label" style="color:#76746B">Stage</div>
          ${badge(normalizedStage)}
          <div class="dv5-vital-hint" style="color:#9A978C">${h(nextAction(r))}</div>
        </div>
        <div class="dv5-vital-card" style="background:#EDE8FB;border-color:#C8BAEF">
          <div class="dv5-vital-label" style="color:#5C3FAD">${type==='pro'?'Commission':'To Refund'}</div>
          <div class="dv5-vital-value" style="color:#3A2580">${fmt2(r.commission)}</div>
          <div class="dv5-vital-hint" style="color:#7B65CC">Total agreed</div>
        </div>
        <div class="dv5-vital-card" style="background:#EDFAA8;border-color:#CEED6A">
          <div class="dv5-vital-label" style="color:#4A5E10">Paid</div>
          <div class="dv5-vital-value" style="color:#2D3C08">${fmt2(r.paid)}</div>
          <div class="dv5-vital-hint" style="color:#6A8018">${r.commission?Math.round(r.paid/r.commission*100)+'% collected':'No commission set'}</div>
        </div>
        <div class="dv5-vital-card${r.balance>0?' dv5-vital-card--clickable':''}" style="background:${r.balance>0?'#FCECEA':'#EDFAA8'};border-color:${r.balance>0?'#F0BCBA':'#CEED6A'}${r.balance>0?';cursor:pointer':''}" ${r.balance>0?`onclick="openBalancePayment('${type}',${r.id})"`:''} title="${r.balance>0?'Click to record a payment':''}">
          <div class="dv5-vital-label" style="color:${r.balance>0?'#8B2010':'#4A5E10'}">Balance${r.balance>0?' <span style="font-size:10px;opacity:.7">· tap to pay</span>':''}</div>
          <div class="dv5-vital-value" style="color:${r.balance>0?'#6B180E':'#2D3C08'}">${fmt2(r.balance)}</div>
          <div class="dv5-vital-hint" style="color:${r.balance>0?'#B05250':'#6A8018'}">${r.balance>0?'Outstanding':'Fully settled'}</div>
        </div>
      </div>

      <!-- Single source summary -->
      <div class="dv5-card" style="margin-bottom:16px">
        <div class="dv5-card-head" style="align-items:flex-start">
          <div>
            <span class="dv5-card-title">Record Health</span>
            <div class="dv5-card-sub">Single source of truth for this candidate</div>
          </div>
          <span class="dv5-badge ${health.level === 'ok' ? 'green' : health.level === 'watch' ? 'amber' : 'red'}">${health.status}</span>
        </div>
        <div class="dv5-stat-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:12px">
          ${statCard('ti-database', health.score + '%', 'Profile Complete', health.missing.length ? `${health.missing.length} missing field${health.missing.length===1?'':'s'}` : 'All key fields present', '#F4F4EC','#372514','#fff')}
          ${statCard('ti-clipboard-check', health.workflowScore + '%', 'Process Complete', h(nextAction(r)), '#EDEDFB','#252677','#fff')}
          ${statCard('ti-paperclip', `${health.docs.done || 0}/${health.docs.total || defs.length}`, 'Documents', `${health.docs.pct || 0}% uploaded`, '#EDFAA8','#5A7A10','#fff')}
          ${statCard('ti-wallet', financeStatusLabel, 'Finance Status', financeStatusHint, '#FCECEA','#8B2010','#fff')}
          ${statCard('ti-history', lastActivity ? fmt(lastActivity) : 'None', 'Last Activity', r.owner || currentUser?.display || 'Dreco team', '#EDE8FB','#4825B8','#fff')}
        </div>
        ${health.missing.length ? `<div class="dv5-empty" style="margin-top:12px;text-align:left;background:#fff;border:1px solid var(--border)">Missing: ${health.missing.map(h).join(', ')}</div>` : ''}
      </div>

      <!-- Pipeline progress -->
      <div class="dv5-card" style="margin-bottom:16px">
        <div class="dv5-card-head" style="margin-bottom:14px">
          <span class="dv5-card-title">Pipeline Progress</span>
          <span class="dv5-card-sub">${h(stageLabels[Math.max(0,stageIdx)] || r.stage || '—')}</span>
        </div>
        <div class="dv5-progress-steps">
          ${stageLabels.map((s,i) => `
            <div class="dv5-step ${i<stageIdx?'done':i===stageIdx?'active':''}" onclick="window.jumpToStage('${type}',${id},${i})" style="cursor:pointer" title="${i===stageIdx?'Current stage':'Jump to '+h(s)}">
              <span>${i+1}</span><small>${h(s)}</small>
            </div>`).join('')}
        </div>
      </div>

      <!-- Checklist + Details -->
      <div class="dv5-two-col" style="margin-bottom:16px">
        <div class="dv5-card">
          <div class="dv5-card-head">
            <span class="dv5-card-title">Stage Checklist</span>
            <span class="dv5-card-sub">${pct}%</span>
          </div>
          <div style="height:4px;background:#f0f0f0;border-radius:2px;margin:0 0 12px">
            <div style="height:100%;width:${pct}%;background:${pct===100?'#C9F035':'#AE9CF0'};border-radius:2px;transition:width .4s"></div>
          </div>
          ${cl.map(x => {
            if (x.done) return `
              <div class="dv5-check-row done" style="opacity:.7">
                <i class="ti ti-circle-check-filled" style="color:#C9F035;font-size:18px;flex-shrink:0"></i>
                <span style="text-decoration:line-through;flex:1">${h(x.label)}</span>
                ${x.action && x.action!=='edit' ? `<button onclick="window.checklistUntick('${type}',${JSON.stringify(id)},'${js(x.label)}')" style="font-size:11px;padding:2px 7px;border-radius:4px;border:1px solid #e4e4e7;background:transparent;color:#9ca3af;cursor:pointer;flex-shrink:0">Undo</button>` : ''}
              </div>`;
            if (x.action === 'docs') return `
              <button class="dv5-check-row clickable" onclick="openDocs('${type}',${JSON.stringify(id)},'${js(r.name)}')" style="width:100%;text-align:left;background:none;border:none;cursor:pointer">
                <i class="ti ti-circle" style="color:#d1d5db;font-size:18px;flex-shrink:0"></i>
                <span>${h(x.label)}</span><span class="dv5-check-hint">Upload →</span>
              </button>`;
            if (x.action === 'edit') return `
              <button class="dv5-check-row clickable" onclick="${type==='pro'?`editPro(${id})`:`editLB(${id})`}" style="width:100%;text-align:left;background:none;border:none;cursor:pointer">
                <i class="ti ti-circle" style="color:#d1d5db;font-size:18px;flex-shrink:0"></i>
                <span>${h(x.label)}</span><span class="dv5-check-hint">Enter amount →</span>
              </button>`;
            return `
              <button class="dv5-check-row clickable" onclick="window.checklistTick('${type}',${JSON.stringify(id)},'${js(x.label)}')" style="width:100%;text-align:left;background:none;border:none;cursor:pointer">
                <i class="ti ti-circle" style="color:#d1d5db;font-size:18px;flex-shrink:0"></i>
                <span>${h(x.label)}</span><span class="dv5-check-hint">Mark done ✓</span>
              </button>`;
          }).join('')}
        </div>

        <div class="dv5-card">
          <div class="dv5-card-head">
            <span class="dv5-card-title">Journey Timeline</span>
            <span class="dv5-card-sub">${h(r.company||r.country||'—')}</span>
          </div>
          ${(() => {
            const milestones = type === 'pro'
              ? [
                  { key:'INTERVIEW', label:'Interview', date:r.raw?.interview || r.interview },
                  { key:'OFFER LETTER', label:'Offer Letter', date:r.raw?.ol || r.ol },
                  { key:'MEDICAL & ATTESTATION', label:'Medical & Attestation', date:r.raw?.medical || r.medical },
                  { key:'WORK PERMIT', label:'Work Permit', date:r.raw?.mol || r.mol },
                  { key:'VISA', label:'Visa', date:r.raw?.visa || r.visa },
                  { key:'TICKET BOOKED', label:'Ticket Booked', date:null },
                  { key:'TRAVELLED', label:'Candidate Travelled', date:r.travel || r.raw?.travel },
                ]
              : [
                  { key:'SUBMITTED', label:'Submitted', date:r.submitted || r.raw?.submitted_date || r.raw?.submitted },
                  { key:'TRAVELLED', label:'Travel', date:r.travel || r.raw?.travel },
                ];
            const currentIdx = type === 'pro'
              ? Math.max(0, PRO_PROFILE_PROCESS.indexOf(resolveProProcessStage(r)))
              : milestones.reduce((acc,m,i)=>m.date?i:acc, -1);
            return `<div style="display:flex;flex-direction:column;gap:0;padding:4px 0">
              ${milestones.map((m,i) => {
                const isDone = type === 'pro' ? i <= currentIdx : !!m.date;
                const isActive = type === 'pro' ? i === currentIdx : (!isDone && i === currentIdx+1);
                const dot = isDone
                  ? `<div style="width:28px;height:28px;border-radius:50%;background:#C9F035;display:flex;align-items:center;justify-content:center;flex-shrink:0;z-index:1"><i class="ti ti-check" style="font-size:14px;color:#1A1C2E"></i></div>`
                  : isActive
                  ? `<div style="width:28px;height:28px;border-radius:50%;background:#AE9CF0;display:flex;align-items:center;justify-content:center;flex-shrink:0;z-index:1"><i class="ti ti-clock" style="font-size:13px;color:#1A1C2E"></i></div>`
                  : `<div style="width:28px;height:28px;border-radius:50%;background:#F0EFF0;border:2px solid #E0DDE8;display:flex;align-items:center;justify-content:center;flex-shrink:0;z-index:1"><i class="ti ti-minus" style="font-size:12px;color:#B0AAC0"></i></div>`;
                const connector = i < milestones.length-1
                  ? `<div style="width:2px;height:22px;margin-left:13px;background:${isDone?'#C9F035':'#E5E3F0'}"></div>`
                  : '';
                return `<div style="display:flex;flex-direction:column">
                  <div style="display:flex;align-items:center;gap:12px">
                    ${dot}
                    <div style="flex:1;min-width:0">
                      <div style="font-size:12px;font-weight:500;color:${isDone?'#1A1C2E':isActive?'#5A3EAD':'#9A96B0'}">${h(m.label)}</div>
                      <div style="font-size:11px;color:${isDone?'#6A8018':isActive?'#7B65CC':'#B0AAC0'};margin-top:1px">${m.date?h(fmt(m.date)):(isDone?'Completed':isActive?'In Progress':'Pending')}</div>
                    </div>
                  </div>
                  ${connector}
                </div>`;
              }).join('')}
            </div>`;
          })()}
        </div>
      </div>

      <!-- Documents table -->
      <div class="dv5-card" style="margin-bottom:16px">
        <div class="dv5-card-head">
          <span class="dv5-card-title">Documents</span>
          <span class="dv5-card-sub">${compl.done} / ${compl.total} uploaded</span>
          <button class="dv5-btn primary" onclick="openDocs('${type}',${JSON.stringify(r.id)},'${js(r.name)}')" style="flex-shrink:0"><i class="ti ti-upload"></i>Upload</button>
        </div>
        <div class="dv5-table-wrap">
          <table class="dv5-table">
            <thead><tr><th>Document</th><th>Status</th><th>File</th><th>Actions</th></tr></thead>
            <tbody>
              ${defs.length ? defs.map(([key, label]) => {
                const item = items[key];
                return `<tr>
                  <td style="font-weight:375">${h(label)}</td>
                  <td>${item
                    ? `<span style="display:inline-flex;align-items:center;gap:4px;color:#16a34a;font-size:12px;font-weight:438"><i class="ti ti-circle-check-filled"></i>Uploaded</span>`
                    : `<span style="display:inline-flex;align-items:center;gap:4px;color:#9ca3af;font-size:12px;font-weight:375"><i class="ti ti-circle"></i>Missing</span>`}
                  </td>
                  <td style="color:#6b7280;font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item ? h(item.fileName||'Document') : '—'}</td>
                  <td style="display:flex;gap:6px;flex-wrap:wrap">
                    ${item?.url ? `<button class="dv5-action-btn" onclick="window.safeOpenUrl('${js(item.url)}')"><i class="ti ti-external-link"></i>View</button>` : ''}
                    <button class="dv5-action-btn" onclick="openDocs('${type}',${JSON.stringify(r.id)},'${js(r.name)}')"><i class="ti ti-upload"></i>${item?'Replace':'Upload'}</button>
                  </td>
                </tr>`;
              }).join('') : `<tr><td colspan="4" style="text-align:center;padding:24px;color:#9ca3af">No document types configured.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="dv5-card">
        <div class="dv5-card-head"><span class="dv5-card-title">Recent Activity</span></div>
        <div class="dv5-activity-list">
          ${timeline.length ? timeline.map(t=>`
            <div class="dv5-activity-item">
              <div class="dv5-activity-icon"><i class="ti ti-clock"></i></div>
              <div>
                <div class="dv5-activity-title">${h(t.action||t.text||'Updated')}</div>
                <div class="dv5-activity-meta">${h(t.user||'Dreco')} · ${h(fmt(t.ts||t.at||''))}</div>
              </div>
            </div>`).join('') : '<div class="dv5-empty">No activity recorded yet.</div>'}
        </div>
      </div>
    </div>`;
  }

  // Map checklist label → {field to set today, stage to advance to}
  const PRO_CHECKLIST_MAP = {
    'Interview done':             { field:'interview', stage:'INTERVIEW' },
    'Offer letter received':      { field:'ol',        stage:'OFFER LETTER' },
    'Medical & attestation done': { field:'medical',   stage:'MEDICAL & ATTESTATION' },
    'Work permit received':       { field:'mol',       stage:'WORK PERMIT' },
    'Visa stamped':               { field:'visa',      stage:'VISA' },
    'Ticket booked':              { field:null,        stage:'TICKET BOOKED' },
    'Candidate travelled':        { field:'travel',    stage:'TRAVELLED' },
  };
  const LB_CHECKLIST_STAGE_MAP = {
    'Profile Sent':    'PROFILE SENT',
    'Selected':        'SELECTED',
    'Passport Applied':'PASSPORT APPLIED',
    'Visa Processing': 'VISA PROCESSING',
    'Travelled':       'TRAVELLED',
  };

  window.checklistTick = async function(type, id, label) {
    const today = new Date().toISOString().slice(0,10);
    const db = type === 'pro' ? proDB : lbDB;
    const rec = db.find(r => String(r.id) === String(id));
    if (!rec) return;

    let updates = {};

    if (type === 'pro') {
      const map = PRO_CHECKLIST_MAP[label];
      if (!map) return;
      if (map.field) updates[map.field] = today;
      updates.stage = map.stage;
      if (map.field) rec[map.field] = today;
      rec.stage = map.stage;
    } else {
      const newStage = LB_CHECKLIST_STAGE_MAP[label];
      if (newStage) {
        updates.stage = newStage;
        rec.stage = newStage;
        if (newStage === 'TRAVELLED') { updates.travelDate = today; rec.travelDate = today; }
      } else {
        // doc tick
        docTicks[`lb_${id}_${label}`] = true;
        saveDocTicks();
        openCandidateProfile(type, id);
        return;
      }
    }

    // Optimistic UI update
    openCandidateProfile(type, id);
    showToast(`✓ ${label}`, 'success');

    // Save to Supabase
    try {
      const table = type === 'pro' ? 'pro_candidates' : 'lb_candidates';
      await dbUpdate(table, id, updates);
      addTimeline(type, id, `Checked: ${label}`);
    } catch(e) {
      console.warn('checklistTick save error', e);
    }

    // Refresh any open page
    rerenderPage();
  };

  window.checklistUntick = async function(type, id, label) {
    const db = type === 'pro' ? proDB : lbDB;
    const rec = db.find(r => String(r.id) === String(id));
    if (!rec) return;

    // LB doc ticks (localStorage only)
    const tickKey = `lb_${id}_${label}`;
    if (type === 'lb' && docTicks[tickKey]) {
      delete docTicks[tickKey];
      saveDocTicks();
      showToast(`Reverted: ${label}`, 'info');
      openCandidateProfile(type, id);
      return;
    }

    if (type === 'pro') {
      const map = PRO_CHECKLIST_MAP[label];
      if (!map) return;
      const proStageList = PRO_PROFILE_PROCESS;
      const idx = proStageList.indexOf(map.stage);
      const prevStage = idx > 0 ? proStageList[idx - 1] : proStageList[0];
      if (map.field) rec[map.field] = null;
      rec.stage = prevStage;
      showToast(`Reverted: ${label}`, 'info');
      openCandidateProfile(type, id);
      try {
        await dbUpdate('pro_candidates', id, map.field ? { [map.field]: null, stage: prevStage } : { stage: prevStage });
        addTimeline(type, id, `Reverted: ${label}`);
      } catch(e) { console.warn('checklistUntick error', e); }
    } else {
      const targetStage = LB_CHECKLIST_STAGE_MAP[label];
      if (!targetStage) return;
      const lbStageList = activeWorkflowStages('lb', rec.country);
      const idx = lbStageList.indexOf(targetStage);
      const prevStage = idx > 0 ? lbStageList[idx - 1] : lbStageList[0];
      rec.stage = prevStage;
      showToast(`Reverted: ${label}`, 'info');
      openCandidateProfile(type, id);
      try {
        await dbUpdate('lb_candidates', id, { stage: prevStage });
        addTimeline(type, id, `Reverted: ${label}`);
      } catch(e) { console.warn('checklistUntick error', e); }
    }
    rerenderPage();
  };

  // ── URL validator for document links (SEC-7 fix) ─────────
  window.safeOpenUrl = function(url) {
    const u = String(url||'').trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) { showToast('Only https:// links can be opened for security.','error'); return; }
    window.open(u, '_blank', 'noopener,noreferrer');
  };

  // ── Init on DOMContentLoaded ──────────────────────────────
  function init() {
    ensureSections();
    buildSidebar();
    // Inject CSS for dv5 components
    if (!document.getElementById('dv5-styles')) {
      const style = document.createElement('style');
      style.id = 'dv5-styles';
      style.textContent = DV5_CSS;
      document.head.appendChild(style);
    }
  }

  // Run init immediately if DOM is already ready (post-login scenario)
  // AND hook DOMContentLoaded for page-load scenario
  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', () => setTimeout(init, 50));
  } else {
    // DOM already loaded (IIFE runs after DOMContentLoaded) — init now
    setTimeout(init, 0);
  }
  // Exposed so loadAllData can call it after data arrives
  window.dv5Init = init;

  // ══════════════════════════════════════════════════════════
  // DV5 CSS — injected once at runtime
  // ══════════════════════════════════════════════════════════
  const DV5_CSS = `
/* === DV5 Component System === */
.dv5-section { display: none; min-width:0; overflow-x:hidden; }
/* DV5 sidebar user card — layout deferred to index.html profile card styles */
.dv5-suc.sidebar-user-card::after { content:none!important; }
.dv5-suc { box-sizing:border-box!important; position:relative!important; }

/* Shadcn-style profile dropdown — slide up from user card */
.dv5-pd { position:fixed!important; left:16px!important; bottom:70px!important; top:auto!important; right:auto!important; width:268px!important; background:#fff!important; border:1px solid #E4E4E7!important; border-radius:10px!important; box-shadow:0 4px 24px rgba(0,0,0,.10),0 1px 4px rgba(0,0,0,.06)!important; z-index:9000!important; overflow:hidden!important; visibility:hidden!important; opacity:0!important; transform:translateY(8px)!important; transition:opacity .15s ease,transform .15s ease,visibility 0s .15s!important; pointer-events:none!important; }
.dv5-pd.open { visibility:visible!important; opacity:1!important; transform:translateY(0)!important; transition:opacity .15s ease,transform .15s ease,visibility 0s 0s!important; pointer-events:auto!important; }
.dv5-pd-head { display:flex; align-items:center; gap:10px; padding:12px 14px; border-bottom:1px solid #F4F4F5; }
.dv5-pd-av { width:36px; height:36px; border-radius:7px; background:#18181B; color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:500; flex-shrink:0; letter-spacing:.02em; }
.dv5-pd-name { font-size:13px; font-weight:375; color:#09090B; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.35; }
.dv5-pd-email { font-size:11px; color:#71717A; margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dv5-pd-items { padding:4px; }
.dv5-pd-item { display:flex; align-items:center; gap:8px; padding:8px 10px; border-radius:6px; font-size:13px; font-weight:625; color:#09090B; background:none; border:none; width:100%; text-align:left; cursor:pointer; font-family:inherit; transition:background .1s; }
.dv5-pd-item:hover { background:#F4F4F5; }
.dv5-pd-item i { font-size:15px; color:#71717A; flex-shrink:0; width:18px; }
.dv5-pd-sep { height:1px; background:#F4F4F5; margin:3px 6px; }
.dv5-pd-item.danger { color:#DC2626; }
.dv5-pd-item.danger i { color:#DC2626; }
.dv5-pd-item.danger:hover { background:#FEF2F2; }

.dv5-page { padding: 0 0 40px; max-width: none; }
.dv5-page-head { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; gap:16px; flex-wrap:wrap; }
.dv5-page-head h1 { font-size:24px; font-weight:562; color:var(--text,#18191B); margin:0 0 4px; letter-spacing:-.5px; }
.dv5-page-head p { font-size:13px; color:var(--text-3,#999); margin:0; line-height:1.4; }
.dv5-head-actions { display:flex; gap:8px; flex-wrap:wrap; }

/* Buttons */
.dv5-btn { display:inline-flex; align-items:center; gap:6px; padding:0 14px; height:34px; border-radius:8px; border:1px solid var(--border,#E8E8E8); background:#fff; font-size:12px; font-weight:438; color:var(--text,#18191B); cursor:pointer; white-space:nowrap; transition:background .15s; }
.dv5-btn:hover { background:var(--bg,#F3F3F3); }
.dv5-btn.primary { background:var(--dreco-ink,#1A1C2E); color:#fff; border-color:var(--dreco-ink,#1A1C2E); }
.dv5-btn.primary:hover { background:#2B2A25; }
.dv5-btn-icon { display:inline-flex; align-items:center; justify-content:center; width:34px; height:34px; border-radius:8px; border:1px solid var(--border,#E8E8E8); background:#fff; cursor:pointer; color:var(--text-2,#555); }
.dv5-btn-icon:hover { background:var(--bg,#F3F3F3); }
.dv5-link { background:none; border:none; color:var(--dreco-ink,#1A1C2E); font-size:12px; font-weight:438; cursor:pointer; padding:0; flex-shrink:0; white-space:nowrap; }
.dv5-action-btn { display:inline-flex; align-items:center; gap:4px; padding:0 10px; height:28px; border-radius:6px; border:1px solid var(--border,#E8E8E8); background:#fff; font-size:11px; font-weight:438; color:var(--text,#18191B); cursor:pointer; }
.dv5-action-btn:hover { background:var(--bg,#F3F3F3); }
.dv5-action-queue { margin-bottom:12px; background:linear-gradient(160deg,#FFF1F2 0%,#FFE4E6 100%)!important; border-color:#FECACA!important; }
.dv5-action-grid { display:flex; flex-direction:column; gap:0; }
.dv5-action-card { border:none; border-bottom:1px solid rgba(190,18,60,.12); background:transparent; border-radius:0; padding:10px 2px; display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:12px; text-align:left; cursor:pointer; transition:background .12s; width:100%; }
.dv5-action-card:last-child { border-bottom:none; }
.dv5-action-card:hover { background:rgba(190,18,60,.07); border-radius:8px; }
.dv5-action-card .dv5-avatar { background:rgba(190,18,60,.1); color:#BE123C; border-radius:10px; }
.dv5-action-card span { min-width:0; }
.dv5-action-card strong { display:block; font-size:12.5px; font-weight:500; color:#BE123C; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dv5-action-card em { display:block; font-style:normal; font-size:11px; color:rgba(190,18,60,.6); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dv5-action-card b { color:#BE123C; font-size:12px; font-weight:562; }
.dv5-next-action { display:inline-flex; align-items:center; border-radius:999px; padding:5px 9px; background:var(--dreco-soft,#F8F7EF); color:var(--dreco-ink,#1A1C2E); font-size:10px; font-weight:500; white-space:nowrap; }
.dv5-workflow-mini { min-width:112px; }
.dv5-workflow-top { display:flex; justify-content:space-between; gap:8px; align-items:center; margin-bottom:4px; }
.dv5-workflow-top span { color:#4B5563; font-size:10px; font-weight:469; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dv5-workflow-top strong { color:#18191B; font-size:10px; font-weight:531; flex-shrink:0; }
.dv5-workflow-bar { height:5px; border-radius:999px; background:#EEF2F7; overflow:hidden; }
.dv5-workflow-bar i { display:block; height:100%; border-radius:inherit; background:#16A34A; }
.dv5-workflow-mini.watch .dv5-workflow-bar i { background:#F59E0B; }
.dv5-workflow-mini.risk .dv5-workflow-bar i { background:#EF4444; }
.dv5-workflow-reasons { margin-top:4px; color:#9A3412; font-size:9.5px; font-weight:438; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

/* Stat card grid (shadcn hotel-style colored cards) */
.dv5-stat-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; margin-bottom:16px; }
.dv5-stat-card { border-radius:14px; padding:20px; box-shadow:0 1px 4px rgba(0,0,0,.07); transition:transform .15s,box-shadow .15s; }
.dv5-stat-card:hover { transform:translateY(-1px); box-shadow:0 4px 16px rgba(0,0,0,.10); }
.dv5-stat-icon { width:40px; height:40px; border-radius:11px; display:flex; align-items:center; justify-content:center; font-size:18px; }
.dv5-stat-val { font-size:28px; font-weight:562; color:#18191B; line-height:1; margin:14px 0 4px; }
.dv5-stat-label { font-size:13px; font-weight:438; color:#18191B; }
.dv5-stat-sub { font-size:11px; color:rgba(0,0,0,.5); margin-top:3px; }

/* File manager cards */
.dv5-file-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:14px; margin-bottom:16px; }
.dv5-file-card { background:#fff; border:1px solid var(--border,#E8E8E8); border-radius:14px; padding:20px; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,.06); transition:border-color .15s,box-shadow .15s; }
.dv5-file-card:hover { border-color:var(--dreco-line-strong,#D6D1C3); box-shadow:0 4px 12px rgba(23,23,21,.08); }
.dv5-file-card-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
.dv5-file-card-label { font-size:13px; font-weight:438; color:var(--text,#18191B); }
.dv5-file-count { font-size:34px; font-weight:562; color:var(--text,#18191B); line-height:1; margin-bottom:14px; }
.dv5-file-bar-wrap { height:6px; background:#F1F1F1; border-radius:999px; overflow:hidden; margin-bottom:8px; }
.dv5-file-bar { height:100%; border-radius:999px; transition:width .5s cubic-bezier(.4,0,.2,1); }
.dv5-file-foot { display:flex; justify-content:space-between; font-size:11px; color:var(--text-3,#999); font-weight:438; margin-bottom:14px; }
.dv5-file-link { font-size:12px; font-weight:438; color:var(--text-3,#999); display:flex; align-items:center; gap:4px; padding-top:10px; border-top:1px solid var(--border,#E8E8E8); }
.dv5-file-card:hover .dv5-file-link { color:var(--dreco-ink,#1A1C2E); }

/* Transactions */
.dv5-tx-header { display:flex; justify-content:space-between; align-items:flex-start; padding:16px 20px 0; flex-wrap:wrap; gap:12px; }
.dv5-tx-tabs { display:flex; gap:2px; padding:12px 20px 0; border-bottom:1px solid var(--border,#E8E8E8); }
.dv5-tx-tab { background:none; border:none; padding:8px 14px; font-size:13px; font-weight:438; color:var(--text-3,#999); border-radius:8px 8px 0 0; cursor:pointer; transition:color .15s; }
.dv5-tx-tab.active { color:var(--text,#18191B); border-bottom:2px solid #18191B; }
.dv5-tx-tab:hover { color:var(--text,#18191B); }
.dv5-tx-list { }
.dv5-tx-row { display:grid; grid-template-columns:130px 1fr auto 36px; align-items:center; gap:12px; padding:14px 20px; border-bottom:1px solid var(--border,#F1F1F1); cursor:pointer; transition:background .1s; }
.dv5-tx-row:hover { background:#F9F9F9; }
.dv5-tx-row:last-child { border-bottom:0; }
.dv5-tx-date { font-size:12px; font-weight:438; color:var(--text-3,#999); white-space:nowrap; }
.dv5-tx-name { font-size:13px; font-weight:438; color:var(--text,#18191B); }
.dv5-tx-status { font-size:11px; color:var(--text-3,#999); margin-top:2px; }
.dv5-tx-amt { font-size:13px; font-weight:500; white-space:nowrap; text-align:right; }
.dv5-tx-arrow { width:32px; height:32px; border:1px solid var(--border,#E8E8E8); border-radius:8px; background:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:14px; color:var(--text-3,#999); transition:background .1s; }
.dv5-tx-arrow:hover { background:var(--bg,#F5F5F5); }

/* Date presets */
.dv5-date-presets { display:flex; gap:4px; flex-wrap:wrap; }
.dv5-preset-btn { background:#fff; border:1px solid var(--border,#E8E8E8); border-radius:8px; padding:5px 12px; font-size:12px; font-weight:438; color:var(--text-3,#999); cursor:pointer; transition:all .15s; white-space:nowrap; }
.dv5-preset-btn:hover { background:var(--bg,#F5F5F5); color:var(--text,#18191B); }
.dv5-preset-btn.active { background:#18191B; color:#fff; border-color:#18191B; }

/* KPI grid */
.dv5-kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:16px; }
.dv5-kpi { background:#fff; border:1px solid var(--border,#E8E8E8); border-radius:12px; padding:20px; cursor:default; transition:border-color .15s; box-shadow:0 1px 3px rgba(0,0,0,.06); }
.dv5-kpi[onclick] { cursor:pointer; }
.dv5-kpi:hover[onclick] { border-color:var(--dreco-line-strong,#D6D1C3); }
.dv5-kpi-icon { width:36px; height:36px; border-radius:10px; background:#F3F3F3; display:flex; align-items:center; justify-content:center; font-size:16px; color:var(--dreco-ink,#1A1C2E); margin-bottom:10px; }
.dv5-kpi-icon.purple { background:#EDE8FB; color:#4825B8; }
.dv5-kpi-icon.green  { background:#ECFDF5; color:#059669; }
.dv5-kpi-icon.amber  { background:#FFFBEB; color:#D97706; }
.dv5-kpi-icon.blue   { background:#EDEDFB; color:#252677; }
.dv5-kpi-icon.rose   { background:#FCECEA; color:#8B2010; }
.dv5-kpi-icon.teal   { background:#F0FDFA; color:#0D9488; }
.dv5-kpi-icon.ink    { background:var(--dreco-ink,#1A1C2E); color:#fff; }
.dv5-kpi-val { font-size:22px; font-weight:562; color:var(--text,#18191B); line-height:1; margin-bottom:4px; }
.dv5-kpi-label { font-size:12px; font-weight:438; color:var(--text,#18191B); }
.dv5-kpi-note { font-size:11px; color:var(--text-3,#999); margin-top:2px; }

/* Priority grid */
.dv5-priority-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; margin-bottom:16px; }
.dv5-priority { background:#fff; border:1px solid #EAEAD6; border-radius:14px; padding:20px; cursor:pointer; transition:border-color .15s,box-shadow .15s; text-align:left; box-shadow:0 1px 4px rgba(0,0,0,.05),0 4px 16px rgba(0,0,0,.04); }
.dv5-priority:hover { border-color:var(--dreco-line-strong,#D6D1C3); box-shadow:0 4px 16px rgba(23,23,21,.08); }
.dv5-priority-icon { width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:18px; color:var(--dreco-ink,#1A1C2E); margin-bottom:12px; }
.dv5-priority strong { display:block; font-size:34px; font-weight:700; color:var(--text,#18191B); line-height:1; margin-bottom:6px; letter-spacing:-.02em; }
.dv5-priority span { display:block; font-size:12px; font-weight:500; color:var(--text,#18191B); }
.dv5-priority small { display:block; font-size:11px; color:var(--text-3,#999); margin-top:3px; }

/* Cards */
.dv5-card { background:#fff; border:1px solid #EAEAD6; border-radius:14px; padding:22px; margin-bottom:12px; box-shadow:0 1px 4px rgba(0,0,0,.05),0 4px 16px rgba(0,0,0,.04); }
.dv5-card-pipeline { background:linear-gradient(135deg,#FFFFFF 0%,#FAF8EF 55%,#F4F4EC 100%); border-color:#E4E1D6; padding:16px 20px; }
.dv5-card-pipeline .dv5-flow-step strong { color:#1E1B4B; }
.dv5-card-pipeline .dv5-flow-step span { color:#6B7280; }
.dv5-card-pipeline .dv5-flow-arrow { color:#9A978C; }
.dv5-card-pipeline .dv5-pipeline-flow { padding:4px 0; }
.dv5-card-head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:12px; min-width:0; }
.dv5-card-title { font-size:13px; font-weight:500; color:var(--text,#18191B); flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dv5-card-sub { font-size:11px; color:var(--text-3,#999); flex-shrink:0; white-space:nowrap; }
.dv5-two-col { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; min-width:0; }
.dv5-three-col { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:12px; min-width:0; align-items:stretch; }
.dv5-three-col > .dv5-card { display:flex; flex-direction:column; }
.dv5-three-col > .dv5-card .dv5-action-grid,
.dv5-three-col > .dv5-card .dv5-task-list,
.dv5-three-col > .dv5-card .dv5-activity-list { flex:1; }
.dv5-table-card { background:#fff; border:1px solid var(--border,#E8E8E8); border-radius:12px; overflow:hidden; margin-bottom:12px; }

/* Tables */
.dv5-table-wrap { overflow-x:auto; }
.dv5-table { width:100%; border-collapse:collapse; font-size:12px; }
.dv5-table thead th { padding:10px 12px; text-align:left; font-size:11px; font-weight:500; color:var(--text-3,#999); text-transform:uppercase; letter-spacing:.04em; background:#FAFAFA; border-bottom:1px solid var(--border,#E8E8E8); white-space:nowrap; }
.dv5-table tbody tr { border-bottom:1px solid var(--border,#E8E8E8); transition:background .12s; cursor:pointer; }
.dv5-table tbody tr:last-child { border-bottom:0; }
.dv5-table tbody tr:hover { background:#FAFAFA; }
.dv5-table tbody td { padding:0 12px; height:44px; color:var(--text,#18191B); vertical-align:middle; }

/* Name cells */
.dv5-name-cell { display:flex; align-items:center; gap:10px; }
.dv5-name { font-size:12px; font-weight:438; color:var(--text,#18191B); }
.dv5-sub { font-size:11px; color:var(--text-3,#999); margin-top:1px; }
.dv5-next-action { font-size:11px; font-weight:438; color:var(--dreco-ink,#1A1C2E); }

/* Avatars */
.dv5-avatar { width:32px; height:32px; min-width:32px; border-radius:999px; background:#E4E1D6; color:#171715; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:562; overflow:hidden; }
.dv5-avatar img,
.dv5-profile-avatar img { width:100%; height:100%; object-fit:cover; display:block; border-radius:inherit; }

/* Badges */
.dv5-badge { display:inline-flex; align-items:center; padding:2px 8px; border-radius:999px; font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:.04em; white-space:nowrap; }
.dv5-badge.green  { background:#D1FAE5; color:#065F46; }
.dv5-badge.blue   { background:#EDEDFB; color:#252677; }
.dv5-badge.teal   { background:#EDE8FB; color:#4825B8; }
.dv5-badge.amber  { background:#FCECEA; color:#8B2010; }
.dv5-badge.orange { background:#FFEDD5; color:#C2410C; }
.dv5-badge.red    { background:#FEE2E2; color:#B91C1C; }
.dv5-badge.gray   { background:#F3F4F6; color:#6B7280; }
.dv5-badge.purple { background:#E9DDFB; color:#5347CE; }

/* Pills */
.dv5-pill { display:inline-flex; align-items:center; padding:3px 8px; border-radius:999px; font-size:10px; font-weight:500; white-space:nowrap; background:#F3F3F3; color:#888; }
.dv5-pill.red    { background:#FDEAEA; color:#B83232; }
.dv5-pill.amber  { background:#FDF3DC; color:#B07B10; }
.dv5-pill.danger { background:#FDEAEA; color:#B83232; }

/* Toolbar */
.dv5-toolbar { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:12px; flex-wrap:wrap; }
.dv5-toolbar-left,.dv5-toolbar-right { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.dv5-input { height:34px; padding:0 12px; border:1px solid var(--border,#E8E8E8); border-radius:8px; font-size:12px; outline:none; background:#fff; width:220px; }
.dv5-input:focus { border-color:var(--dreco-line-strong,#D6D1C3); box-shadow:0 0 0 3px rgba(23,23,21,.06); }
.dv5-select { height:34px; padding:0 10px; border:1px solid var(--border,#E8E8E8); border-radius:8px; font-size:12px; background:#fff; outline:none; cursor:pointer; }
.dv5-count { font-size:11px; color:var(--text-3,#999); white-space:nowrap; }
.dv5-view-tabs { display:flex; border:1px solid var(--border,#E8E8E8); border-radius:8px; overflow:hidden; }
.dv5-view-tab { padding:0 12px; height:32px; font-size:11px; font-weight:438; border:none; background:#fff; cursor:pointer; color:var(--text-3,#999); }
.dv5-view-tab.active { background:var(--dreco-ink,#1A1C2E); color:#fff; }

/* Bulk action bar */
.dv5-bulk-bar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; padding:8px 12px; background:var(--dreco-soft,#F8F7EF); border:1px solid var(--dreco-line,#E4E1D6); border-radius:10px; margin-bottom:10px; font-size:12px; font-weight:438; color:var(--dreco-ink,#1A1C2E); }
.dv5-bulk-bar .dv5-select { height:30px; font-size:11px; }
.dv5-bulk-bar .dv5-btn { height:30px; font-size:11px; }
.dv5-row-selected td { background:var(--dreco-soft,#F8F7EF) !important; }
.dv5-client-row.dv5-client-open td { background:var(--dreco-soft,#F8F7EF); }
.dv5-expand-row td { padding:0 !important; }

/* Pipeline Kanban */
.dv5-kanban { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; min-height:60vh; }
.dv5-col { background:#FAFAFA; border:1px solid var(--border,#E8E8E8); border-radius:12px; overflow:hidden; }
.dv5-col-head { display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:#fff; border-bottom:1px solid var(--border,#E8E8E8); }
.dv5-col-head span:first-child { font-size:11px; font-weight:500; text-transform:uppercase; letter-spacing:.06em; color:var(--text,#18191B); }
.dv5-col-count { background:var(--dreco-ink,#1A1C2E); color:#fff; border-radius:999px; padding:2px 7px; font-size:10px; font-weight:500; }
.dv5-col-body { padding:10px; display:flex; flex-direction:column; gap:8px; min-height:100px; }
.dv5-pipe-card { background:#fff; border:1px solid var(--border,#E8E8E8); border-radius:10px; padding:12px; cursor:pointer; transition:border-color .15s,box-shadow .15s; }
.dv5-pipe-card:hover { border-color:var(--dreco-line-strong,#D6D1C3); box-shadow:0 4px 12px rgba(23,23,21,.07); }
.dv5-pipe-name { font-size:12px; font-weight:438; color:var(--text,#18191B); margin-bottom:4px; }
.dv5-pipe-meta { font-size:11px; color:var(--text-3,#999); line-height:1.4; margin-bottom:8px; }
.dv5-pipe-foot { display:flex; justify-content:space-between; font-size:10px; color:var(--text-3,#999); font-weight:438; }

/* Pipeline flow steps */
.dv5-pipeline-flow { display:flex; align-items:center; gap:0; padding:0; width:100%; }
.dv5-flow-step { text-align:center; padding:0 8px; }
.dv5-flow-step strong { display:block; font-size:28px; font-weight:562; color:var(--text,#18191B); line-height:1; margin-bottom:4px; }
.dv5-flow-step span { font-size:10px; color:var(--text-3,#999); font-weight:438; letter-spacing:.04em; text-transform:uppercase; }
.dv5-flow-arrow { color:var(--text-3,#999); font-size:14px; flex-shrink:0; }

/* Tasks */
.dv5-task-list { display:flex; flex-direction:column; gap:4px; }
.dv5-task-item { display:flex; align-items:center; gap:12px; padding:10px 12px; border-radius:8px; cursor:pointer; transition:background .12s; }
.dv5-task-item:hover { background:#FAFAFA; }
.dv5-task-icon { width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:14px; flex-shrink:0; }
.dv5-task-icon.high { background:#FDEAEA; color:#B83232; }
.dv5-task-icon.med  { background:#FDF3DC; color:#B07B10; }
.dv5-task-body { flex:1; min-width:0; }
.dv5-task-title { font-size:12px; font-weight:438; color:var(--text,#18191B); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dv5-task-meta { font-size:11px; color:var(--text-3,#999); }

/* Activity */
.dv5-activity-list { display:flex; flex-direction:column; gap:8px; }
.dv5-activity-item { display:flex; align-items:flex-start; gap:10px; }
.dv5-activity-icon { width:28px; height:28px; border-radius:8px; background:#F3F3F3; display:flex; align-items:center; justify-content:center; font-size:12px; color:#888; flex-shrink:0; }
.dv5-activity-title { font-size:12px; font-weight:438; color:var(--text,#18191B); }
.dv5-activity-meta { font-size:11px; color:var(--text-3,#999); }

/* Bar chart */
.dv5-bar-chart { display:flex; align-items:flex-end; gap:10px; height:160px; padding:0 4px 4px; }
.dv5-bar-wrap { flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; height:100%; justify-content:flex-end; }
.dv5-bar { width:100%; border-radius:6px 6px 3px 3px; background:var(--dreco-ink,#1A1C2E); min-height:12px; transition:height .3s; }
.dv5-bar-wrap span { font-size:10px; color:var(--text-3,#999); font-weight:438; }

/* Empty */
.dv5-empty { padding:24px 12px; text-align:center; font-size:12px; color:var(--text-3,#999); }

/* Candidate Profile Modal */
.dv5-modal-overlay { position:fixed; inset:0; background:rgba(15,23,42,.48); z-index:9999; display:none; align-items:flex-start; justify-content:center; padding:28px 16px; overflow-y:auto; }
.dv5-profile-panel { width:min(1100px,98vw); background:var(--dreco-surface,#fff); border-radius:20px; border:1px solid var(--dreco-line,#E4E1D6); box-shadow:0 30px 90px rgba(23,23,21,.16); padding:20px; margin:auto; }
.dv5-profile-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
.dv5-profile-id { font-size:11px; font-weight:500; text-transform:uppercase; letter-spacing:.06em; color:#7B8496; }
.dv5-profile-actions { display:flex; gap:8px; }
.dv5-profile-hero { display:grid; grid-template-columns:auto 1fr auto; gap:16px; align-items:center; background:#fff; border:1px solid var(--border,#E8E8E8); border-radius:16px; padding:18px; margin-bottom:12px; }
.dv5-profile-avatar { width:60px; height:60px; border-radius:999px; background:#111827; color:#fff; display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:562; flex-shrink:0; overflow:hidden; }
.dv5-candidate-avatar-upload { width:60px; height:60px; border-radius:999px; position:relative; display:block; flex-shrink:0; cursor:pointer; }
.dv5-candidate-avatar-upload input { display:none; }
.dv5-candidate-avatar-upload span { position:absolute; right:-1px; bottom:-1px; width:22px; height:22px; border-radius:999px; display:flex; align-items:center; justify-content:center; background:#242330; color:#fff; border:2px solid #fff; box-shadow:0 5px 14px rgba(31,33,51,.18); }
.dv5-candidate-avatar-upload span i { font-size:11px; }
.dv5-candidate-avatar-upload:hover .dv5-profile-avatar { filter:brightness(.92); }
.dv5-profile-info h2 { font-size:20px; font-weight:500; margin:0 0 4px; }
.dv5-profile-info p { font-size:13px; color:#6B7280; margin:0 0 8px; font-weight:406; }
.dv5-profile-meta { display:flex; gap:14px; flex-wrap:wrap; }
.dv5-profile-meta span { display:inline-flex; gap:5px; align-items:center; font-size:12px; color:#6B7280; font-weight:406; }
.dv5-profile-stage { text-align:right; display:flex; flex-direction:column; gap:6px; align-items:flex-end; }
.dv5-profile-stage small { font-size:11px; color:#7B8496; font-weight:438; }
.dv5-progress-steps { display:grid; grid-template-columns:repeat(auto-fit,minmax(92px,1fr)); gap:8px; margin-bottom:12px; }
.dv5-step { display:flex; flex-direction:column; align-items:center; gap:4px; color:#9CA3AF; font-size:10px; font-weight:500; }
.dv5-step span { width:26px; height:26px; border-radius:999px; border:2px solid #DBE1EB; background:#fff; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:500; }
.dv5-step.done span { background:#22A06B; color:#fff; border-color:#22A06B; }
.dv5-step.active span { background:var(--dreco-ink,#1A1C2E); color:#fff; border-color:var(--dreco-ink,#1A1C2E); }
.dv5-profile-grid { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; margin-bottom:12px; }
.dv5-breadcrumb { display:flex; align-items:center; gap:8px; margin-bottom:16px; font-size:13px; font-weight:438; color:#7B8496; }
.dv5-breadcrumb a,.dv5-breadcrumb button { color:var(--dreco-ink,#1A1C2E); background:none; border:none; cursor:pointer; font-size:13px; font-weight:438; padding:0; text-decoration:none; }
.dv5-breadcrumb a:hover,.dv5-breadcrumb button:hover { text-decoration:underline; }
.dv5-breadcrumb span { color:#7B8496; }
.dv5-profile-vitals { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:12px; }
.dv5-vital-card { border:1px solid; border-radius:12px; padding:16px; }
.dv5-vital-label { font-size:11px; font-weight:438; margin-bottom:6px; text-transform:uppercase; letter-spacing:.04em; }
.dv5-vital-value { font-size:20px; font-weight:500; }
.dv5-vital-hint { font-size:11px; margin-top:4px; }
.dv5-check-row { display:flex; align-items:center; gap:10px; padding:10px 8px; border-bottom:1px solid var(--border,#E8E8E8); font-size:13px; font-weight:375; color:#374151; border-radius:6px; margin:1px 0; }
.dv5-check-row:last-child { border:none; }
.dv5-check-row.clickable:hover { background:var(--dreco-soft,#F8F7EF); color:var(--dreco-ink,#1A1C2E); }
.dv5-check-row.clickable:hover i { color:var(--dreco-ink,#1A1C2E) !important; }
.dv5-check-hint { margin-left:auto; font-size:11px; font-weight:625; color:#9ca3af; white-space:nowrap; opacity:0; transition:opacity .15s; }
.dv5-check-row.clickable:hover .dv5-check-hint { opacity:1; color:var(--dreco-ink,#1A1C2E); }
.dv5-detail-grid { display:grid; grid-template-columns:1fr auto; gap:8px; }
.dv5-detail-grid span { font-size:12px; color:#7B8496; }
.dv5-detail-grid strong { font-size:12px; color:var(--text,#18191B); text-align:right; }

/* Dreco warm-neutral theme */
.dv5-page,
.dv5-section {
  --dreco-bg:#F4F3EC;
  --dreco-shell:#FBFAF4;
  --dreco-surface:#FFFFFF;
  --dreco-soft:#F8F7EF;
  --dreco-ink:#1A1C2E;
  --dreco-muted:#76746B;
  --dreco-muted-2:#9A978C;
  --dreco-line:#E4E1D6;
  --dreco-line-strong:#D6D1C3;
  --dreco-accent:#D8D3C5;
  --dreco-success:#386A52;
  --dreco-success-bg:#E7F0E9;
  --dreco-warning:#8A6424;
  --dreco-warning-bg:#F4ECD9;
  --dreco-danger:#8F3E3C;
  --dreco-danger-bg:#F3E5E2;
  --dreco-info:#46505A;
  --dreco-info-bg:#E7E9EA;
}
.dv5-page { color:var(--dreco-ink); }
.dv5-page-head h1 { color:var(--dreco-ink); font-weight:500; letter-spacing:-.02em; }
.dv5-page-head p,
.dv5-card-sub,
.dv5-count,
.dv5-sub,
.dv5-activity-meta,
.dv5-task-meta,
.dv5-kpi-note,
.dv5-priority small { color:var(--dreco-muted); }
.dv5-btn,
.dv5-btn-icon,
.dv5-action-btn,
.dv5-input,
.dv5-select,
.dv5-view-tabs,
.dv5-preset-btn {
  border-color:var(--dreco-line);
  background:var(--dreco-surface);
  color:var(--dreco-ink);
  box-shadow:none;
}
.dv5-btn:hover,
.dv5-btn-icon:hover,
.dv5-action-btn:hover,
.dv5-preset-btn:hover,
.dv5-task-item:hover,
.dv5-table tbody tr:hover,
.dv5-check-row.clickable:hover { background:var(--dreco-soft); color:var(--dreco-ink); }
.dv5-btn.primary,
.dv5-view-tab.active,
.dv5-preset-btn.active {
  background:var(--dreco-ink);
  color:#fff;
  border-color:var(--dreco-ink);
}
.dv5-btn.primary:hover { background:#2B2A25; }
.dv5-link,
.dv5-breadcrumb a,
.dv5-breadcrumb button,
.dv5-check-row.clickable:hover i,
.dv5-check-row.clickable:hover .dv5-check-hint {
  color:var(--dreco-ink)!important;
}
.dv5-card,
.dv5-table-card,
.dv5-kpi,
.dv5-priority,
.dv5-stat-card,
.dv5-file-card,
.dv5-col,
.dv5-pipe-card,
.dv5-profile-hero {
  background:var(--dreco-surface);
  border-color:var(--dreco-line);
  box-shadow:0 14px 36px rgba(23,23,21,.045);
}
.dv5-vital-card {
  box-shadow:0 8px 24px rgba(23,23,21,.06);
}
.dv5-card-head { border-color:var(--dreco-line); }
.dv5-card-title,
.dv5-kpi-label,
.dv5-kpi-val,
.dv5-priority span,
.dv5-priority strong,
.dv5-stat-val,
.dv5-stat-label,
.dv5-name,
.dv5-pipe-name,
.dv5-task-title,
.dv5-activity-title,
.dv5-profile-info h2,
.dv5-detail-grid strong { color:var(--dreco-ink); font-weight:500; }
.dv5-kpi-icon,
.dv5-file-card i,
.dv5-activity-icon {
  background:var(--dreco-soft)!important;
  color:var(--dreco-ink)!important;
}
.dv5-kpi-icon.purple { background:#EDE8FB!important; color:#4825B8!important; }
.dv5-kpi-icon.blue   { background:#EDEDFB!important; color:#252677!important; }
.dv5-kpi-icon.teal   { background:#F0FDFA!important; color:#0D9488!important; }
.dv5-kpi-icon.rose   { background:#FCECEA!important; color:#8B2010!important; }
.dv5-kpi-icon.green  { background:#ECFDF5!important; color:#059669!important; }
.dv5-kpi-icon.amber  { background:#FFFBEB!important; color:#D97706!important; }
.dv5-stat-icon {
  background:var(--dreco-ink)!important;
  color:#fff!important;
}
.dv5-task-icon.high { background:#FCECEA!important; color:#8B2010!important; }
.dv5-task-icon.med  { background:#EDEDFB!important; color:#252677!important; }
.dv5-stat-card {
  background:linear-gradient(180deg,#FFFFFF 0%,#FAF9F2 100%)!important;
  border:1px solid var(--dreco-line)!important;
}
.dv5-kpi-icon.ink {
  background:var(--dreco-ink)!important;
  color:#fff!important;
}
.dv5-priority {
  background:linear-gradient(180deg,#FFFFFF 0%,#FAF9F2 100%)!important;
  border-color:var(--dreco-line)!important;
}
.dv5-priority:hover,
.dv5-kpi:hover[onclick],
.dv5-file-card:hover,
.dv5-pipe-card:hover {
  border-color:var(--dreco-line-strong)!important;
  box-shadow:0 18px 40px rgba(23,23,21,.075)!important;
}
.dv5-priority-icon {
  background:var(--dreco-ink)!important;
  color:#fff!important;
}
.dv5-card-pipeline {
  background:linear-gradient(135deg,#FFFFFF 0%,#FAF8EF 55%,#F2EFE3 100%)!important;
  border-color:var(--dreco-line)!important;
}
.dv5-pipeline-title { color:var(--dreco-ink)!important; font-size:14px!important; font-weight:500!important; }
.dv5-pipeline-link { color:var(--dreco-muted)!important; font-size:11px!important; }
.dv5-card-pipeline .dv5-flow-step strong { color:var(--dreco-ink)!important; font-weight:500; }
.dv5-card-pipeline .dv5-flow-step span { color:var(--dreco-muted)!important; }
.dv5-card-pipeline .dv5-flow-arrow { color:var(--dreco-muted-2)!important; }
.dv5-flow-track { margin-top:8px; height:3px; border-radius:2px; background:#E8E4D7; overflow:hidden; }
.dv5-flow-fill { height:100%; background:var(--dreco-ink); border-radius:2px; transition:width .6s cubic-bezier(.4,0,.2,1); }
.dv5-flow-fill.done { background:var(--dreco-success); }
.dv5-home-analytics { display:grid; grid-template-columns:minmax(0,1.7fr) minmax(300px,.72fr); gap:16px; margin-bottom:16px; align-items:stretch; }
.dv5-home-analytics .dv5-card { margin-bottom:0; }
.dv5-line-card { border-radius:22px!important; padding:22px 24px!important; box-shadow:none!important; }
.dv5-line-card .dv5-link,.dv5-line-card .dv5-action-grid { display:none!important; }
.dv5-line-card .dv5-card-title { font-size:18px!important; font-weight:625!important; letter-spacing:-.035em; }
.dv5-line-chart { min-height:250px; display:flex; flex-direction:column; justify-content:space-between; }
.dv5-line-legend { display:flex; justify-content:flex-end; gap:24px; color:#777783; font-size:12px; margin:-4px 4px 8px; }
.dv5-line-legend span { display:inline-flex; align-items:center; gap:8px; }
.dv5-line-legend b { width:10px; height:10px; border-radius:50%; background:#AE9CF0; }
.dv5-line-legend span:nth-child(2) b { background:#1A1C2E; }
.dv5-line-chart svg { width:100%; height:176px; display:block; overflow:visible; }
.dv5-line-axis,.dv5-line-summary { display:flex; justify-content:space-between; color:#8C8A93; font-size:11px; }
.dv5-line-summary { margin-top:8px; color:#1A1C2E; font-weight:500; }
.dv5-recent-card { display:none!important; }
.dv5-dashboard-lower { display:grid; grid-template-columns:minmax(300px,.74fr) minmax(0,1.26fr); gap:16px; margin-bottom:12px; align-items:stretch; }
.dv5-status-summary { position:relative; overflow:hidden; min-height:156px; border-radius:22px; background:#1E1D2E; color:#fff; padding:22px 24px; margin-bottom:14px; }
.dv5-status-summary span { display:block; color:#fff; font-size:17px; font-weight:625; letter-spacing:-.03em; }
.dv5-status-summary small { display:block; margin-top:22px; color:#A9A8B5; font-size:12px; font-weight:406; }
.dv5-status-summary strong { display:block; margin-top:6px; color:#13B9A8; font-size:38px; line-height:1; font-weight:700; letter-spacing:-.05em; }
.dv5-status-summary svg { position:absolute; right:22px; bottom:24px; width:46%; height:72px; }
.dv5-ring-card { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
.dv5-ring-stat { display:grid; grid-template-columns:auto 1fr; align-items:center; gap:12px; min-width:0; }
.dv5-ring { position:relative; display:block; width:54px; height:54px; border-radius:50%; flex:0 0 auto; }
.dv5-ring::after { content:''; position:absolute; inset:9px; border-radius:50%; background:#fff; }
.dv5-ring-stat small { display:block; color:#777783; font-size:12px; font-weight:500; white-space:nowrap; }
.dv5-ring-stat strong { display:block; color:#1E1D2E; font-size:23px; line-height:1; margin-top:4px; font-weight:700; letter-spacing:-.04em; }
.dv5-funnel-card { border-radius:22px!important; padding:24px!important; box-shadow:none!important; }
.dv5-funnel-card .dv5-card-title { font-size:17px!important; font-weight:625!important; letter-spacing:-.035em; }
/* Monthly placements bar tooltip */
.dv5-mp-bar { position:relative; transition:filter .12s; }
.dv5-mp-bar::after { content:attr(data-tip); position:absolute; bottom:calc(100% + 5px); left:50%; transform:translateX(-50%); background:#1A1C2E; color:#fff; font-size:10px; font-weight:500; padding:3px 7px; border-radius:5px; white-space:nowrap; pointer-events:none; opacity:0; transition:opacity .12s; z-index:20; }
.dv5-mp-bar:hover { filter:brightness(1.12); }
.dv5-mp-bar:hover::after { opacity:1; }
@media(max-width:1100px){.dv5-home-analytics,.dv5-dashboard-lower{grid-template-columns:1fr}.dv5-line-chart{min-height:220px}}
@media(max-width:640px){.dv5-ring-card{grid-template-columns:1fr}}
.dv5-action-queue {
  background:linear-gradient(180deg,#FFFFFF 0%,#F7F2EC 100%)!important;
  border-color:#E6D8CC!important;
}
.dv5-action-queue .dv5-card-title { color:var(--dreco-danger)!important; }
.dv5-action-queue .dv5-card-sub,
.dv5-action-queue .dv5-link { color:#9B7468!important; }
.dv5-action-card { border-color:rgba(143,62,60,.14)!important; }
.dv5-action-card:hover { background:rgba(143,62,60,.055)!important; }
.dv5-action-card .dv5-avatar { background:var(--dreco-danger-bg)!important; color:var(--dreco-danger)!important; }
.dv5-action-card strong,
.dv5-action-card b { color:var(--dreco-danger)!important; font-weight:500!important; }
.dv5-action-card em { color:#9B7468!important; }
.dv5-next-action { background:var(--dreco-soft)!important; color:var(--dreco-ink)!important; }
.dv5-workflow-bar { background:#E8E4D7; }
.dv5-workflow-bar i { background:var(--dreco-success); }
.dv5-workflow-mini.watch .dv5-workflow-bar i { background:var(--dreco-warning); }
.dv5-workflow-mini.risk .dv5-workflow-bar i { background:var(--dreco-danger); }
.dv5-table thead th,
.dv5-col,
.dv5-col-head,
.dv5-bulk-bar { background:var(--dreco-soft)!important; border-color:var(--dreco-line)!important; color:var(--dreco-muted)!important; }
.dv5-table tbody tr,
.dv5-table tbody td { border-color:var(--dreco-line); }
.dv5-col-count,
.dv5-step.active span { background:var(--dreco-ink)!important; color:#fff!important; border-color:var(--dreco-ink)!important; }
.dv5-step.done span { background:var(--dreco-success)!important; border-color:var(--dreco-success)!important; }
.dv5-bar,
.dv5-file-bar { background:linear-gradient(180deg,#1A1C2E,#45433D)!important; }
.dv5-row-selected td,
.dv5-client-row.dv5-client-open td { background:#F1EDE2!important; }
.dv5-badge.green,
.dv5-pill.green   { background:#D1FAE5!important; color:#065F46!important; }
.dv5-badge.blue   { background:#DBEAFE!important; color:#1D4ED8!important; }
.dv5-badge.teal   { background:#CCFBF1!important; color:#0F766E!important; }
.dv5-badge.amber,
.dv5-pill.amber   { background:#FEF3C7!important; color:#92400E!important; }
.dv5-badge.orange { background:#FFEDD5!important; color:#C2410C!important; }
.dv5-badge.red,
.dv5-pill.red,
.dv5-pill.danger  { background:#FEE2E2!important; color:#B91C1C!important; }
.dv5-badge.gray,
.dv5-badge.purple,
.dv5-pill,
.dv5-pill.gray    { background:#F3F4F6!important; color:#6B7280!important; }
.dv5-modal-overlay { background:rgba(23,23,21,.46); }
.dv5-profile-panel { background:var(--dreco-bg); border-color:rgba(255,255,255,.72); }
.dv5-profile-avatar,
.dv5-avatar { background:#E4E1D6!important; color:#171715!important; }

/* Premium Dreco palette: warm SaaS, purple brand, lime accent */
.dv5-page,
.dv5-section {
  --dreco-brand:#5347CE;
  --dreco-brand-2:#6A5CF0;
  --dreco-bg:#FAFAF8;
  --dreco-shell:#FFFFFF;
  --dreco-surface:#FFFFFF;
  --dreco-soft:#F5F4F1;
  --dreco-ink:#242330;
  --dreco-ink-deep:#1F2133;
  --dreco-muted:#7E7C8C;
  --dreco-muted-2:#A9A7B4;
  --dreco-line:#ECEAE6;
  --dreco-line-strong:#DDDAD4;
  --dreco-accent:#DDF56C;
  --dreco-accent-soft:#F3FCCB;
  --dreco-success:#49774E;
  --dreco-success-bg:#DCECC8;
  --dreco-warning:#8A6A16;
  --dreco-warning-bg:#F6EEB6;
  --dreco-danger:#A7444A;
  --dreco-danger-bg:#FFE1E2;
  --dreco-info:#5347CE;
  --dreco-info-bg:#E9DDFB;
  --dreco-card-pink:#FFC2C6;
  --dreco-card-lavender:#D9D8F2;
  --dreco-card-lime:#F3FFC6;
  --dreco-card-pink-line:#F0AEB5;
  --dreco-card-lavender-line:#C8C6E8;
  --dreco-card-lime-line:#E3F3A5;
}
.dv5-card,
.dv5-table-card,
.dv5-kpi,
.dv5-priority,
.dv5-stat-card,
.dv5-file-card,
.dv5-col,
.dv5-pipe-card,
.dv5-profile-hero {
  background:#FFFFFF!important;
  border-color:var(--dreco-line)!important;
  box-shadow:0 18px 44px rgba(31,33,51,.055)!important;
}
.dv5-card-pipeline {
  background:linear-gradient(135deg,#FFFFFF 0%,#FAFAF8 58%,#F5F4F1 100%)!important;
}
.dv5-kpi:nth-child(3n+1),
.dv5-priority:nth-child(3n+1),
.dv5-stat-card:nth-child(3n+1),
.dv5-file-card:nth-child(3n+1) {
  background:#FFFFFF!important;
  border-color:var(--dreco-line)!important;
}
.dv5-kpi:nth-child(3n+2),
.dv5-priority:nth-child(3n+2),
.dv5-stat-card:nth-child(3n+2),
.dv5-file-card:nth-child(3n+2) {
  background:#FFFFFF!important;
  border-color:var(--dreco-line)!important;
}
.dv5-kpi:nth-child(3n),
.dv5-priority:nth-child(3n),
.dv5-stat-card:nth-child(3n),
.dv5-file-card:nth-child(3n) {
  background:#FFFFFF!important;
  border-color:var(--dreco-line)!important;
}
.dv5-kpi-label,
.dv5-priority span,
.dv5-stat-card span,
.dv5-stat-card small {
  color:var(--dreco-muted)!important;
}
.dv5-kpi-val,
.dv5-priority strong,
.dv5-stat-card strong {
  color:#1F2133!important;
  font-weight:650!important;
}
.dv5-btn.primary {
  background:var(--dreco-brand)!important;
  border-color:var(--dreco-brand)!important;
  color:#FFFFFF!important;
}
.dv5-view-tab.active,
.dv5-preset-btn.active,
.dv5-col-count,
.dv5-step.active span {
  background:var(--dreco-accent)!important;
  border-color:var(--dreco-accent)!important;
  color:var(--dreco-ink-deep)!important;
}
.dv5-stat-icon,
.dv5-kpi-icon.ink,
.dv5-priority-icon {
  background:var(--dreco-soft)!important;
  color:var(--dreco-brand)!important;
}
.dv5-kpi-icon,
.dv5-priority-icon,
.dv5-stat-icon {
  width:42px!important;
  height:42px!important;
  border-radius:13px!important;
  background:var(--dreco-card-lavender)!important;
  color:#1F2133!important;
  box-shadow:none!important;
}
.dv5-kpi:nth-child(3n+1) .dv5-kpi-icon,
.dv5-priority:nth-child(3n+1) .dv5-priority-icon,
.dv5-stat-card:nth-child(3n+1) .dv5-stat-icon {
  background:var(--dreco-card-pink)!important;
}
.dv5-kpi:nth-child(3n+2) .dv5-kpi-icon,
.dv5-priority:nth-child(3n+2) .dv5-priority-icon,
.dv5-stat-card:nth-child(3n+2) .dv5-stat-icon {
  background:var(--dreco-card-lavender)!important;
}
.dv5-kpi:nth-child(3n) .dv5-kpi-icon,
.dv5-priority:nth-child(3n) .dv5-priority-icon,
.dv5-stat-card:nth-child(3n) .dv5-stat-icon {
  background:var(--dreco-card-lime)!important;
}
.dv5-badge.green,
.dv5-pill.green { background:#DCECC8!important; color:#49774E!important; }
.dv5-badge.blue { background:#DDE9F7!important; color:#426CA8!important; }
.dv5-badge.teal { background:#DDF8EE!important; color:#3E8170!important; }
.dv5-badge.amber,
.dv5-pill.amber { background:#F6EEB6!important; color:#8A6A16!important; }
.dv5-badge.orange { background:#F5D7C8!important; color:#A05B3F!important; }
.dv5-badge.red,
.dv5-pill.red,
.dv5-pill.danger { background:#FFE1E2!important; color:#A7444A!important; }
.dv5-badge.gray,
.dv5-badge.purple,
.dv5-pill,
.dv5-pill.gray { background:#E9DDFB!important; color:#5347CE!important; }
.dv5-bar,
.dv5-file-bar,
.dv5-flow-fill { background:linear-gradient(180deg,#5347CE,#6A5CF0)!important; }
.dv5-flow-fill.done { background:#49774E!important; }
.dv5-profile-avatar,
.dv5-avatar {
  background:#E9DDFB!important;
  color:#5347CE!important;
  border-radius:999px!important;
  overflow:hidden!important;
}
.dv5-profile-avatar img,
.dv5-avatar img {
  width:100%!important;
  height:100%!important;
  object-fit:cover!important;
  border-radius:999px!important;
  display:block!important;
}

/* Rounded corner pass */
.dv5-card,
.dv5-table-card,
.dv5-kpi,
.dv5-priority,
.dv5-stat-card,
.dv5-file-card,
.dv5-col,
.dv5-profile-hero,
.dv5-profile-panel {
  border-radius:22px!important;
}
.dv5-pipe-card,
.dv5-action-card:hover,
.dv5-task-item,
.dv5-activity-item,
.dv5-check-row,
.dv5-vital-card,
.dv5-input,
.dv5-select,
.dv5-btn,
.dv5-btn-icon,
.dv5-action-btn,
.dv5-bulk-bar,
.dv5-view-tabs,
.dv5-pd {
  border-radius:18px!important;
}

/* ── Responsive ─────────────────────────────────────────────────────────────
   Breakpoints (match index.html):
     ≥ 1100px  full desktop  — sidebar 224px, 3-col grids, 6-step progress
     860–1100  compact       — sidebar icon-only (64px), 3-col still fits
     640–860   tablet        — sidebar hidden/hamburger, 2-col grids
     < 640     mobile        — bottom-nav, 1-col grids
   ─────────────────────────────────────────────────────────────────────────── */

/* Tables always scroll horizontally — applies at every width */
.dv5-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
.dv5-table { min-width:560px; }

/* ── compact desktop (sidebar shrinks to icons, content stays wide) ──────── */
@media (max-width:1100px) {
  /* kanban: 5-col → 3-col */
  .dv5-kanban { grid-template-columns:repeat(3,1fr); }
  /* progress steps: 6 → 3 per row */
  .dv5-progress-steps { grid-template-columns:repeat(3,1fr); }
  /* profile grid 3-col → 2-col */
  .dv5-profile-grid { grid-template-columns:1fr 1fr!important; }
  /* vitals 4-col → 2-col */
  .dv5-profile-vitals { grid-template-columns:repeat(2,1fr); }
  /* three-col → 2-col */
  .dv5-three-col { grid-template-columns:1fr 1fr!important; }
  /* two-col stays 2 — wide enough */
}

/* ── tablet (no sidebar) ─────────────────────────────────────────────────── */
@media (max-width:860px) {
  .dv5-section,.dv5-page { min-width:0; overflow-x:hidden; }
  .dv5-page { padding:16px 16px 30px!important; }
  .dv5-page-head h1 { font-size:20px; }
  /* grids stay 2-col at tablet */
  .dv5-two-col { grid-template-columns:1fr 1fr; }
  .dv5-three-col { grid-template-columns:1fr 1fr!important; }
  .dv5-kanban { grid-template-columns:1fr 1fr; }
  .dv5-kpi-grid,.dv5-stat-grid,.dv5-file-grid { grid-template-columns:repeat(2,1fr); }
  .dv5-priority-grid { grid-template-columns:repeat(2,1fr); }
  /* Pipeline flow: horizontal scroll */
  .dv5-pipeline-flow { overflow-x:auto; -webkit-overflow-scrolling:touch; padding-bottom:4px; }
  .dv5-flow-step { min-width:80px; flex-shrink:0; }
}

/* ── mobile (< 640px) ────────────────────────────────────────────────────── */
@media (max-width:640px) {
  #app { padding:0!important; }
  .app-layout { border-radius:0; }
  .content-area { padding:12px 12px 88px!important; }
  .dv5-section,.dv5-page { min-width:0; overflow-x:hidden; }
  .dv5-page { padding:12px 12px 88px!important; }
  .dv5-page-head { margin-bottom:12px; gap:8px; }
  .dv5-page-head h1 { font-size:18px; }
  /* everything collapses to 1-col */
  .dv5-two-col,.dv5-three-col { grid-template-columns:1fr!important; }
  .dv5-profile-grid { grid-template-columns:1fr!important; }
  .dv5-profile-vitals { grid-template-columns:1fr 1fr; }
  .dv5-kpi-grid,.dv5-stat-grid,.dv5-file-grid { grid-template-columns:1fr 1fr; gap:8px; }
  .dv5-priority-grid { grid-template-columns:1fr 1fr; gap:8px; }
  /* last odd card spans full width */
  .dv5-priority-grid > *:last-child:nth-child(odd),
  .dv5-kpi-grid > *:last-child:nth-child(odd) { grid-column:1/-1; flex-direction:row; align-items:center; gap:12px; }
  .dv5-priority-grid > *:last-child:nth-child(odd) .dv5-priority-icon,
  .dv5-kpi-grid > *:last-child:nth-child(odd) .dv5-kpi-icon { margin-bottom:0; }
  .dv5-priority-grid > *:last-child:nth-child(odd) strong { margin-bottom:0; }
  .dv5-tx-row { grid-template-columns:80px 1fr auto 28px; gap:6px; padding:10px 12px; }
  .dv5-date-presets { gap:3px; }
  .dv5-profile-hero { grid-template-columns:1fr; }
  .dv5-profile-stage { align-items:flex-start; text-align:left; }
  .dv5-progress-steps { grid-template-columns:repeat(3,1fr); gap:6px; }
  .dv5-toolbar { flex-direction:column; align-items:stretch; gap:8px; }
  .dv5-toolbar-left,.dv5-toolbar-right { flex-wrap:wrap; }
  .dv5-input,.dv5-select { width:100%; }
  .dv5-head-actions { flex-wrap:wrap; width:100%; }
  .dv5-head-actions .dv5-btn { flex:1; justify-content:center; min-width:100px; }
  .dv5-card { padding:12px; margin-bottom:8px; }
  .dv5-kpi { padding:12px; }
  .dv5-priority { padding:12px; }
  .dv5-kanban { grid-template-columns:1fr; }
  .dv5-pipeline-flow { overflow-x:auto; -webkit-overflow-scrolling:touch; padding-bottom:4px; }
  .dv5-flow-step { min-width:64px; flex-shrink:0; }
  .dv5-card-pipeline { padding:12px; }
  .dv5-table { min-width:440px; }
  .dv5-modal-overlay { padding:10px 8px; }
}

/* ── small phone (< 420px) ───────────────────────────────────────────────── */
@media (max-width:420px) {
  .dv5-page { padding:10px 10px 88px!important; }
  .dv5-kpi-grid,.dv5-priority-grid { gap:6px; }
  .dv5-table { min-width:380px; }
}
  `;

  // Expose allRows for the command palette (different IIFE scope)
  window._drecoAllRows = allRows;

})();

// =============================================================
// DRECO Document Upload System
// =============================================================
(function(){
  const BUCKET = 'candidate-documents';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const js = v => String(v ?? '').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\n/g,' ');
  const nowISO = () => new Date().toISOString();
  const currentDisplay = () => (window.currentUser?.display || window.currentUser?.username || 'User');
  const companyIdSafe = () => {
    try { return (typeof getCompanyId === 'function' ? getCompanyId() : (window.currentUser?.companyId || 'default-company')); }
    catch { return 'default-company'; }
  };
  const recordByType = (type,id) => (type === 'pro' ? (window.proDB || proDB || []) : (window.lbDB || lbDB || [])).find(r => String(r.id) === String(id)) || {};
  const docKey = (type,id) => `${type}_${id}`;
  const fmtBytes = bytes => {
    const n = Number(bytes || 0);
    if(!n) return '';
    if(n < 1024) return `${n} B`;
    if(n < 1024*1024) return `${(n/1024).toFixed(1)} KB`;
    return `${(n/1024/1024).toFixed(1)} MB`;
  };
  const safeFileName = name => String(name || 'document').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').slice(0,90);
  const DOC_DEFS = {
    pro: [
      ['passport','Passport'],
      ['good_conduct','Good Conduct'],
      ['cv','CV'],
      ['photo','Photo'],
      ['offer_letter','Offer Letter'],
      ['mol','Work Permit'],
      ['medical','Medical / GAMCA'],
      ['visa','Visa'],
      ['ticket','Ticket'],
      ['contract','Contract']
    ],
    lb: [
      ['passport','Passport'],
      ['good_conduct','Good Conduct'],
      ['cv','CV'],
      ['photo','Photo'],
      ['payment_receipt','Payment Receipt'],
      ['ticket','Ticket'],
      ['contract','Contract'],
      ['other','Other Supporting Document']
    ]
  };
  function getDefs(type){ return DOC_DEFS[type] || DOC_DEFS.pro; }
  function normalizeDocStore(value){
    if(value && typeof value === 'object' && !Array.isArray(value)){
      if(value.items && typeof value.items === 'object') return value;
      return { version: 2, items: value, updatedAt: value.updatedAt || nowISO() };
    }
    if(typeof value === 'string' && value.trim()){
      return { version: 2, legacyFolderLink: value.trim(), items: { legacy_folder: { label:'Legacy Drive Folder', fileName:'Google Drive folder', url:value.trim(), uploadedAt:'', uploadedBy:'Legacy', legacy:true } } };
    }
    return { version: 2, items: {} };
  }
  function getDocStore(type,id){
    window.allDocs = window.allDocs || (typeof allDocs !== 'undefined' ? allDocs : {});
    return normalizeDocStore(window.allDocs[docKey(type,id)]);
  }
  function setDocStore(type,id,store){
    window.allDocs = window.allDocs || (typeof allDocs !== 'undefined' ? allDocs : {});
    store.version = 2;
    store.updatedAt = nowISO();
    window.allDocs[docKey(type,id)] = store;
    try { if(typeof allDocs !== 'undefined') setAllDocs(window.allDocs); } catch {}
  }
  function docItems(type,id){ return getDocStore(type,id).items || {}; }
  function uploadedCount(type,id){ return Object.values(docItems(type,id)).filter(Boolean).length; }
  function completion(type,id){ const total = getDefs(type).length; return { done: uploadedCount(type,id), total, pct: Math.round(uploadedCount(type,id) / Math.max(1,total) * 100) }; }

  function hasAnyDoc(type,id){ return uploadedCount(type,id) > 0; }
  window.hasDocs = function(a,b){
    if(typeof a === 'object' && a){ return hasAnyDoc(a.type, a.id); }
    return hasAnyDoc(a,b);
  };
  window.drecoDocCompletion = function(type,id){ return completion(type,id); };
  window.drecoCandidateDocs = function(type,id){ return docItems(type,id); };
  window.drecoDocDefs = function(type){ return getDefs(type); };

  async function persistDocs(type,id,store){
    setDocStore(type,id,store);
    const key = docKey(type,id);
    if(typeof saveDocsToDB === 'function') await saveDocsToDB(key, store);
    else if(typeof saveLocalStore === 'function') saveLocalStore();
    refreshDocsUI(type,id);
  }
  function refreshDocsUI(type,id){
    try { renderDocChecklist(type,id); } catch {}
    const active = sessionStorage.getItem('dreco_active_tab') || '';
    try { if(typeof renderDocumentsV4 === 'function') renderDocumentsV4(); } catch {}
  }
  function closeOverlays(exceptId){
    $$('.modal-bg.open,.modal.open,.v4-modal.open').forEach(el => { if(el.id !== exceptId) el.classList.remove('open'); });
  }

  window.openDocs = function(type,id,name){
    closeOverlays('docs-modal');
    window.docsTarget = { type, id, name };
    try { docsTarget = window.docsTarget; } catch {}
    const modal = $('#docs-modal');
    if(!modal) return;
    // Always appear above any open profile/DV5 overlay (z-index:9999)
    modal.style.setProperty('z-index','19999','important');
    const title = $('#docs-modal-title');
    if(title) title.textContent = `Documents - ${name || 'Candidate'}`;
    const panel = modal.querySelector('.modal');
    if(panel) panel.style.maxWidth = '920px';
    const body = modal.querySelector('.modal-body');
    if(body){
      body.innerHTML = `
        <div class="dreco-upload-intro">
          <div>
            <strong>Candidate document checklist</strong>
            <span>Upload files directly into Dreco. Uploaded items show status, date, uploader, view, replace, and delete actions.</span>
          </div>
          <div id="dreco-doc-progress" class="dreco-doc-progress"></div>
        </div>
        <div id="docs-checklist" class="doc-checklist dreco-upload-list"></div>
      `;
    }
    const footer = modal.querySelector('.modal-footer');
    if(footer){
      footer.style.justifyContent = 'space-between';
      footer.innerHTML = `
        <button class="btn" onclick="drecoDownloadDocIndex()"><i class="ti ti-list-details"></i> Document Index</button>
        <div style="display:flex;gap:8px">
          <button class="btn" onclick="closeModal('docs-modal')">Close</button>
        </div>
      `;
    }
    renderDocChecklist(type,id);
    modal.classList.add('open');
  };

  window.renderDocChecklist = function(type,id){
    const el = $('#docs-checklist'); if(!el) return;
    const store = getDocStore(type,id);
    const items = store.items || {};
    const defs = getDefs(type);
    const c = completion(type,id);
    const progress = $('#dreco-doc-progress');
    if(progress) progress.innerHTML = `<strong>${c.done}/${c.total}</strong><span>${c.pct}% complete</span><i><b style="width:${Math.min(100,c.pct)}%"></b></i>`;
    el.innerHTML = defs.map(([key,label]) => {
      const d = items[key];
      const uploaded = !!d;
      return `
        <div class="dreco-doc-item ${uploaded ? 'uploaded' : 'missing'}">
          <div class="dreco-doc-main">
            <div class="dreco-doc-status"><i class="ti ${uploaded ? 'ti-circle-check-filled' : 'ti-cloud-upload'}"></i></div>
            <div class="dreco-doc-copy">
              <strong>${esc(label)}</strong>
              ${uploaded ? `<span>${esc(d.fileName || 'Uploaded file')} ${d.size ? '• '+fmtBytes(d.size) : ''}</span><small>Uploaded ${esc(formatDocDate(d.uploadedAt))} by ${esc(d.uploadedBy || 'User')}</small>` : `<span>Missing</span><small>Accepted: PDF, image, Word, Excel, text files</small>`}
            </div>
          </div>
          <div class="dreco-doc-actions">
            ${uploaded ? `<button class="btn tiny" onclick="drecoViewDoc('${js(type)}','${js(id)}','${js(key)}')"><i class="ti ti-eye"></i> View</button>` : ''}
            <label class="btn tiny primary">
              <i class="ti ${uploaded ? 'ti-refresh' : 'ti-upload'}"></i> ${uploaded ? 'Replace' : 'Upload'}
              <input type="file" hidden onchange="drecoUploadDoc('${js(type)}','${js(id)}','${js(key)}',this)">
            </label>
            ${uploaded ? `<button class="btn tiny danger" onclick="drecoDeleteDoc('${js(type)}','${js(id)}','${js(key)}')"><i class="ti ti-trash"></i></button>` : ''}
          </div>
        </div>`;
    }).join('');
  };
  function formatDocDate(v){
    if(!v) return 'previously';
    const d = new Date(v);
    return isNaN(d) ? String(v) : d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
  }
  async function fileToDataUrl(file){
    return new Promise((resolve,reject)=>{ const r = new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); });
  }
  async function uploadToSupabase(path,file){
    if(!_supabaseDb) return null;
    const client = _supabaseDb;
    if(!client?.storage) return null;
    const { error } = await client.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
    if(error) throw error;
    const { data } = client.storage.from(BUCKET).getPublicUrl(path);
    return data?.publicUrl || '';
  }
  window.drecoUploadDoc = async function(type,id,docType,input){
    const file = input?.files?.[0];
    if(!file) return;
    const defs = Object.fromEntries(getDefs(type));
    const label = defs[docType] || docType;
    const store = getDocStore(type,id);
    store.items = store.items || {};
    const path = `${companyIdSafe()}/${type}/${id}/${docType}/${Date.now()}-${safeFileName(file.name)}`;
    try{
      if(typeof showToast === 'function') showToast('Uploading document...', 'info');
      let url = '';
      let storage = 'supabase';
      try { url = await uploadToSupabase(path,file); }
      catch(storageErr){
        console.warn('Supabase Storage upload failed. Falling back to local file preview:', storageErr);
        url = await fileToDataUrl(file);
        storage = 'local-preview';
      }
      store.items[docType] = { label, fileName:file.name, mimeType:file.type, size:file.size, path, url, uploadedAt:nowISO(), uploadedBy:currentDisplay(), storage };
      await persistDocs(type,id,store);
      try { addTimeline(type,id,`${label} uploaded`); } catch {}
      try { auditAction('Documents',`${label} uploaded`, recordByType(type,id).name || 'Candidate'); } catch {}
      if(typeof showToast === 'function') showToast(`${label} uploaded ✓`, 'success');
    }catch(err){
      console.error(err);
      if(typeof showToast === 'function') showToast(err.message || 'Upload failed', 'error');
      else alert(err.message || 'Upload failed');
    }finally{ if(input) input.value=''; }
  };
  window.drecoViewDoc = function(type,id,docType){
    const d = docItems(type,id)[docType];
    if(!d?.url){ alert('File not available.'); return; }
    window.open(d.url, '_blank', 'noopener,noreferrer');
  };
  window.drecoDeleteDoc = async function(type,id,docType){
    const store = getDocStore(type,id); const d = store.items?.[docType];
    if(!d) return;
    if(!confirm(`Delete ${d.label || docType}?`)) return;
    try{
      const client = _supabaseDb;
      if(client?.storage && d.storage === 'supabase' && d.path){
        await client.storage.from(BUCKET).remove([d.path]).catch(()=>{});
      }
      delete store.items[docType];
      await persistDocs(type,id,store);
      try { addTimeline(type,id,`${d.label || docType} deleted`); } catch {}
      try { auditAction('Documents',`${d.label || docType} deleted`, recordByType(type,id).name || 'Candidate'); } catch {}
      if(typeof showToast === 'function') showToast('Document deleted', 'success');
    }catch(err){
      console.error(err);
      if(typeof showToast === 'function') showToast(err.message || 'Delete failed', 'error');
    }
  };
  window.drecoDownloadDocIndex = function(){
    const t = window.docsTarget || (typeof docsTarget !== 'undefined' ? docsTarget : null);
    if(!t) return;
    const items = docItems(t.type,t.id);
    const rows = [['Document','File name','Uploaded at','Uploaded by','URL']];
    Object.values(items).forEach(d => rows.push([d.label||'', d.fileName||'', d.uploadedAt||'', d.uploadedBy||'', d.url||'']));
    const csv = rows.map(r => r.map(v => '"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${(t.name||'candidate').replace(/[^a-z0-9]+/gi,'-')}-documents.csv`; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };
  // Legacy handlers now no-op/compatibility wrappers.
  window.onDocsLinkInput = function(){};
  window.openCurrentDocLink = function(){
    const t = window.docsTarget || (typeof docsTarget !== 'undefined' ? docsTarget : null); if(!t) return;
    const first = Object.values(docItems(t.type,t.id))[0]; if(first?.url) window.open(first.url,'_blank');
  };
  window.saveDocs = async function(){
    const t = window.docsTarget || (typeof docsTarget !== 'undefined' ? docsTarget : null); if(!t) return;
    await persistDocs(t.type,t.id,getDocStore(t.type,t.id));
    if(typeof showToast === 'function') showToast('Documents saved ✓','success');
    closeModal('docs-modal');
  };

  // Upgrade document page to checklist-aware status.
  window.renderDocumentsV4 = function(){
    const el = $('#documents-section'); if(!el) return;
    const all = (typeof rows === 'function' ? rows() : [ ...(window.proDB||[]).map(r=>({...r,type:'pro'})), ...(window.lbDB||[]).map(r=>({...r,type:'lb'})) ]);
    const rowsHTML = all.map(x=>{
      const c = completion(x.type,x.id);
      const req = getDefs(x.type).map(d=>d[1]).slice(0,6).join(', ') + (getDefs(x.type).length>6?'...':'');
      return `<tr onclick="openDocs('${js(x.type)}','${js(x.id)}','${js(x.name)}')"><td><div class="v4-name"><div class="v4-avatar">${esc((x.name||'?').split(/\s+/).map(p=>p[0]).join('').slice(0,2))}</div><div><strong>${esc(x.name)}</strong><span>${esc(x.pp || 'No passport')}</span></div></div></td><td>${esc(x.type==='pro'?'Professional':'General')}</td><td>${esc(req)}</td><td><div class="doc-table-progress"><b>${c.done}/${c.total}</b><i><span style="width:${c.pct}%"></span></i></div></td><td>${c.done ? '<span class="v4-doc-ok">Uploaded</span>' : '<span class="v4-doc-miss">Missing</span>'}</td><td><button class="dreco-btn" onclick="event.stopPropagation();openDocs('${js(x.type)}','${js(x.id)}','${js(x.name)}')">Manage</button></td></tr>`;
    }).join('');
    const complete = all.filter(x=>completion(x.type,x.id).pct >= 100).length;
    const partial = all.filter(x=>{ const c=completion(x.type,x.id); return c.done>0 && c.pct<100; }).length;
    const missing = all.filter(x=>completion(x.type,x.id).done===0).length;
    el.innerHTML = `<div class="v4-page"><div class="v4-head"><div><h1>Documents</h1><p>Direct per-candidate uploads with checklist status, view, replace and delete actions.</p></div><div class="v4-actions"><button class="dreco-btn primary" onclick="switchTab('candidates')">Open Candidates</button></div></div><div class="v4-kpi-grid"><div class="v4-kpi"><span>Complete</span><strong>${complete}</strong><small>All required files</small></div><div class="v4-kpi"><span>Partial</span><strong>${partial}</strong><small>Some files uploaded</small></div><div class="v4-kpi"><span>Missing</span><strong>${missing}</strong><small>No documents yet</small></div><div class="v4-kpi"><span>Total files</span><strong>${all.reduce((s,x)=>s+uploadedCount(x.type,x.id),0)}</strong><small>Uploaded records</small></div></div><div class="v4-card"><table class="v4-table"><thead><tr><th>Candidate</th><th>Type</th><th>Required Checklist</th><th>Progress</th><th>Status</th><th>Action</th></tr></thead><tbody>${rowsHTML}</tbody></table></div></div>`;
  };
  // switchTab wrapper removed — DV5 handles tab routing.
  // renderDocumentsV4 is available globally for direct calls if needed.
})();

// =============================================================
// DRECO Mobile Patch
// =============================================================
(function(){
  const MOBILE_MAX = 860;
  function isMobile(){ return window.matchMedia && window.matchMedia('(max-width: '+MOBILE_MAX+'px)').matches; }

  function labelMobileTables(root=document){
    root.querySelectorAll('table').forEach(table=>{
      const heads=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim()).filter(Boolean);
      table.querySelectorAll('tbody tr').forEach(row=>{
        [...row.children].forEach((td,i)=>{
          if(!td.getAttribute('data-label')) td.setAttribute('data-label', heads[i] || 'Details');
        });
      });
    });
  }

  function keepBottomNavUsable(){
    const nav=document.getElementById('bottom-nav');
    if(!nav) return;
    if(document.getElementById('app')?.style.display !== 'none') nav.classList.add('visible');
    const active=nav.querySelector('.bottom-nav-item.active');
    if(active && isMobile()) active.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'});
  }

  function closeStackedModals(){
    const open=[...document.querySelectorAll('.modal-bg.open,.modal-bg.show,.modal-backdrop.open,.modal-backdrop.show')].filter(el=>getComputedStyle(el).display!=='none');
    if(open.length <= 1) return;
    open.slice(0,-1).forEach(el=>{ el.classList.remove('open','show'); el.style.display='none'; });
    const last=open[open.length-1]; last.style.display='flex'; last.classList.add('open');
  }

  function tuneMobile(){
    document.body.classList.toggle('dreco-mobile', isMobile());
    labelMobileTables();
    keepBottomNavUsable();
    closeStackedModals();
  }

  const originalSwitch = window.switchTab;
  if(typeof originalSwitch === 'function' && !originalSwitch.__mobileWrapped){
    window.switchTab = function(){
      const out = originalSwitch.apply(this, arguments);
      setTimeout(tuneMobile, 60);
      setTimeout(tuneMobile, 250);
      return out;
    };
    window.switchTab.__mobileWrapped = true;
  }

  ['renderDash','renderCandidates','renderPipeline','renderFinance','renderReports','renderDocuments','renderClients'].forEach(name=>{
    const fn=window[name];
    if(typeof fn === 'function' && !fn.__mobileWrapped){
      window[name]=function(){ const out=fn.apply(this,arguments); setTimeout(tuneMobile,40); return out; };
      window[name].__mobileWrapped=true;
    }
  });

  const mo=new MutationObserver(()=>{
    if(window.__drecoMobileTuneTimer) clearTimeout(window.__drecoMobileTuneTimer);
    window.__drecoMobileTuneTimer=setTimeout(tuneMobile,80);
  });
  document.addEventListener('DOMContentLoaded',()=>{
    tuneMobile();
    const app=document.getElementById('app') || document.body;
    mo.observe(app,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
  });
  window.addEventListener('resize',()=>setTimeout(tuneMobile,100),{passive:true});
  window.drecoTuneMobile=tuneMobile;
})();

// =============================================================
// DRECO Stabilization Pass
// =============================================================
/* Adds safe auth/nav state, modal discipline, local backups, render guards,
   mobile table labels, storage readiness diagnostics and a small health check.
   This patch is intentionally additive: it does not replace the login screen,
   logo, Supabase config, existing renderers, or candidate data model. */
(function drecoStabilizationPass(){
  if (window.__drecoStabilizationPass) return;
  window.__drecoStabilizationPass = true;

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const BACKUP_INDEX_KEY = 'dreco_backup_index_v1';
  const MAX_BACKUPS = 8;

  function appIsVisible(){
    const app = $('#app');
    if (!app) return false;
    return app.style.display !== 'none' && getComputedStyle(app).display !== 'none';
  }

  function syncAuthShellState(){
    const logged = !!currentUser && appIsVisible();
    document.body.classList.toggle('logged-in', logged);
    const nav = $('#bottom-nav');
    if (nav) {
      nav.classList.toggle('visible', logged);
      nav.setAttribute('aria-hidden', logged ? 'false' : 'true');
      if (!logged) nav.querySelectorAll('.bottom-nav-item.active').forEach(btn => btn.classList.remove('active'));
    }
  }

  function showHealthMessage(title, body){
    let el = $('#dreco-health-badge');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dreco-health-badge';
      el.className = 'dreco-health-badge';
      document.body.appendChild(el);
    }
    el.innerHTML = `<strong>${title}</strong>${body}`;
    el.classList.add('show');
    clearTimeout(window.__drecoHealthTimer);
    window.__drecoHealthTimer = setTimeout(()=>el.classList.remove('show'), 7000);
  }

  function getStoreKey(){
    try { return `${LOCAL_STORE_KEY}_${getCompanyId()}`; } catch { return `${LOCAL_STORE_KEY}_unknown`; }
  }

  function currentSnapshot(){
    return {
      pro: Array.isArray(proDB) ? proDB : [],
      lb: Array.isArray(lbDB) ? lbDB : [],
      docs: allDocs && typeof allDocs === 'object' ? allDocs : {},
      timelines: allTimelines && typeof allTimelines === 'object' ? allTimelines : {},
      proStages: Array.isArray(proStages) ? proStages : [],
      lbStages: Array.isArray(lbStages) ? lbStages : [],
      at: new Date().toISOString(),
      companyId: (typeof getCompanyId === 'function' ? getCompanyId() : 'unknown')
    };
  }

  function hasUsefulData(snapshot){
    return (snapshot.pro?.length || 0) + (snapshot.lb?.length || 0) + Object.keys(snapshot.docs || {}).length > 0;
  }

  function readStoredSnapshot(){
    try {
      const raw = safeLocalGet(getStoreKey());
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function createBackup(reason='manual'){
    try {
      const stored = readStoredSnapshot() || currentSnapshot();
      if (!hasUsefulData(stored)) return null;
      const id = `dreco_backup_${(typeof getCompanyId === 'function' ? getCompanyId() : 'company')}_${Date.now()}`;
      const payload = { ...stored, backupReason: reason, backupAt: new Date().toISOString() };
      safeLocalSet(id, JSON.stringify(payload));
      const index = JSON.parse(safeLocalGet(BACKUP_INDEX_KEY) || '[]').filter(Boolean);
      index.unshift({ id, reason, companyId: payload.companyId || (typeof getCompanyId === 'function' ? getCompanyId() : ''), at: payload.backupAt, pro: payload.pro?.length || 0, lb: payload.lb?.length || 0 });
      const trimmed = index.slice(0, MAX_BACKUPS);
      index.slice(MAX_BACKUPS).forEach(item => { try { localStorage.removeItem(item.id); } catch {} });
      safeLocalSet(BACKUP_INDEX_KEY, JSON.stringify(trimmed));
      return id;
    } catch (err) {
      console.warn('Dreco backup could not be created:', err);
      return null;
    }
  }

  function latestBackup(){
    try {
      const index = JSON.parse(safeLocalGet(BACKUP_INDEX_KEY) || '[]');
      const companyId = typeof getCompanyId === 'function' ? getCompanyId() : '';
      return index.find(x => !companyId || x.companyId === companyId) || index[0] || null;
    } catch { return null; }
  }

  function restoreLatestBackup(){
    const item = latestBackup();
    if (!item) return false;
    try {
      const backup = JSON.parse(safeLocalGet(item.id) || '{}');
      if (!hasUsefulData(backup)) return false;
      setProDB((backup.pro || []).map(typeof normalizeProRecord === 'function' ? normalizeProRecord : x => x));
      setLbDB((backup.lb || []).map(typeof normalizeLBRecord === 'function' ? normalizeLBRecord : x => x));
      setAllDocs(backup.docs || {});
      setAllTimelines(backup.timelines || {});
      if (backup.proStages?.length) setProStages(backup.proStages);
      if (backup.lbStages?.length) setLbStages(backup.lbStages);
      if (typeof saveLocalStore === 'function') saveLocalStore();
      if (typeof switchTab === 'function') switchTab(sessionStorage.getItem('dreco_active_tab') || 'dash');
      if (typeof showToast === 'function') showToast('Restored latest local backup.', 'success');
      return true;
    } catch (err) {
      console.warn('Dreco backup restore failed:', err);
      return false;
    }
  }

  function installStorageGuard(){
    if (typeof saveLocalStore !== 'function' || saveLocalStore.__drecoGuarded) return;
    const original = saveLocalStore;
    saveLocalStore = function guardedSaveLocalStore(){
      const before = readStoredSnapshot();
      const next = currentSnapshot();
      const beforeCount = (before?.pro?.length || 0) + (before?.lb?.length || 0);
      const nextCount = (next.pro?.length || 0) + (next.lb?.length || 0);
      if (beforeCount > 0 && nextCount === 0) {
        console.error('Blocked unsafe empty data save. Existing candidate data was preserved.');
        showHealthMessage('Unsafe save blocked', 'Dreco prevented an empty candidate state from overwriting saved data.');
        return;
      }
      if (beforeCount > 0) createBackup('before-save');
      return original.apply(this, arguments);
    };
    saveLocalStore.__drecoGuarded = true;
  }

  function closeAllModalsExcept(active){
    const activeId = typeof active === 'string' ? active : active?.id;
    const openModals = $$('.modal-bg.open,.modal-backdrop.open,#candidate-profile-modal.open,#candidate-profile-modal-v4.open,#v4-command.open,#command-modal.open,#quick-country-modal.open');
    openModals.forEach(el => {
      if (el.id && el.id === activeId) return;
      el.classList.remove('open','show','dreco-modal-active');
      if (el.classList.contains('modal-backdrop')) el.style.display = 'none';
    });
    const activeEl = activeId ? document.getElementById(activeId) : null;
    if (activeEl) activeEl.classList.add('dreco-modal-active');
    document.body.classList.toggle('dreco-modal-open', !!activeEl || openModals.length > 0);
  }

  function installModalManager(){
    if (window.__drecoModalManagerInstalled) return;
    window.__drecoModalManagerInstalled = true;

    const observe = new MutationObserver(records => {
      const opened = records
        .map(r => r.target)
        .filter(el => el instanceof HTMLElement && (el.classList.contains('open') || el.classList.contains('show')))
        .filter(el => el.matches('.modal-bg,.modal-backdrop,#candidate-profile-modal,#candidate-profile-modal-v4,#v4-command,#command-modal,#quick-country-modal'));
      if (!opened.length) {
        document.body.classList.toggle('dreco-modal-open', $$('.modal-bg.open,.modal-backdrop.open,#candidate-profile-modal.open,#candidate-profile-modal-v4.open,#v4-command.open,#command-modal.open,#quick-country-modal.open').length > 0);
        return;
      }
      const last = opened[opened.length - 1];
      setTimeout(() => closeAllModalsExcept(last), 0);
    });
    document.addEventListener('DOMContentLoaded', () => observe.observe(document.body, { subtree:true, attributes:true, attributeFilter:['class'] }));

    const originalClose = typeof closeModal === 'function' ? closeModal : null;
    if (originalClose && !originalClose.__drecoManaged) {
      closeModal = function managedCloseModal(id){
        const out = originalClose.apply(this, arguments);
        setTimeout(()=>{
          document.body.classList.toggle('dreco-modal-open', $$('.modal-bg.open,.modal-backdrop.open,#candidate-profile-modal.open,#candidate-profile-modal-v4.open,#v4-command.open,#command-modal.open,#quick-country-modal.open').length > 0);
        }, 0);
        return out;
      };
      closeModal.__drecoManaged = true;
    }

    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      const open = $$('.modal-bg.open,.modal-backdrop.open,#candidate-profile-modal.open,#candidate-profile-modal-v4.open,#v4-command.open,#command-modal.open,#quick-country-modal.open').pop();
      if (!open) return;
      open.classList.remove('open','show','dreco-modal-active');
      open.style.display = '';
      document.body.classList.toggle('dreco-modal-open', $$('.modal-bg.open,.modal-backdrop.open,#candidate-profile-modal.open,#candidate-profile-modal-v4.open,#v4-command.open,#command-modal.open,#quick-country-modal.open').length > 0);
    });
  }

  function labelMobileTables(root=document){
    $$('table', root).forEach(table => {
      const heads = $$('thead th', table).map(th => th.textContent.trim()).filter(Boolean);
      if (!heads.length) return;
      table.classList.add('dreco-mobile-table');
      $$('tbody tr', table).forEach(row => {
        Array.from(row.children).forEach((td, i) => {
          if (!td.getAttribute('data-label')) td.setAttribute('data-label', heads[i] || 'Details');
        });
      });
    });
  }

  function ensureEmptyStates(root=document){
    $$('.panel,.v4-card,.dreco-card', root).forEach(card => {
      const tbody = $('tbody', card);
      if (tbody && !tbody.children.length && !$('.dreco-empty-state', card)) {
        const row = document.createElement('tr');
        const colCount = Math.max(1, $$('thead th', card).length || 1);
        row.innerHTML = `<td colspan="${colCount}"><div class="dreco-empty-state">No records found yet.</div></td>`;
        tbody.appendChild(row);
      }
    });
  }

  function installRenderGuards(){
    const names = ['renderDash','renderCandidates','renderPipeline','renderFinance','renderReports','renderDocuments','renderClients','renderPro','renderLB','renderCommissions','renderRepayments','renderExpenses','renderTravel'];
    names.forEach(name => {
      const fn = window[name];
      if (typeof fn !== 'function' || fn.__drecoGuarded) return;
      window[name] = function guardedRender(){
        try {
          const out = fn.apply(this, arguments);
          setTimeout(()=>{ labelMobileTables(); ensureEmptyStates(); syncAuthShellState(); }, 20);
          return out;
        } catch (err) {
          console.error(`${name} failed:`, err);
          showHealthMessage('View render failed', `${name} hit an error. Existing data was not changed.`);
          return null;
        }
      };
      window[name].__drecoGuarded = true;
    });
  }

  function installAuthStateWrappers(){
    ['doLogin','doSignup','doLogout','loadAllData','switchTab'].forEach(name => {
      const fn = window[name];
      if (typeof fn !== 'function' || fn.__drecoAuthWrapped) return;
      window[name] = function drecoAuthWrapped(){
        const result = fn.apply(this, arguments);
        Promise.resolve(result).finally(()=>{
          setTimeout(syncAuthShellState, 0);
          setTimeout(syncAuthShellState, 160);
          setTimeout(()=>{ labelMobileTables(); ensureEmptyStates(); }, 180);
        });
        return result;
      };
      window[name].__drecoAuthWrapped = true;
    });
  }

  async function checkStorageReadiness(){
    const status = {
      mode: typeof getStorageLabel === 'function' ? getStorageLabel() : 'Unknown',
      supabaseClient: !!_supabaseDb,
      storageBucket: 'candidate-documents',
      bucketReachable: false,
      error: ''
    };
    if (!_supabaseDb?.storage) return status;
    try {
      const { data, error } = await _supabaseDb.storage.from('candidate-documents').list('', { limit:1 });
      if (error) throw error;
      status.bucketReachable = Array.isArray(data);
    } catch (err) {
      status.error = err.message || 'Candidate document bucket is not reachable.';
    }
    return status;
  }

  async function runHealthCheck(){
    const storage = await checkStorageReadiness();
    const result = {
      loggedIn: !!currentUser,
      appVisible: appIsVisible(),
      candidates: { professional: Array.isArray(proDB) ? proDB.length : 0, general: Array.isArray(lbDB) ? lbDB.length : 0 },
      documents: allDocs ? Object.keys(allDocs).length : 0,
      timelines: allTimelines ? Object.keys(allTimelines).length : 0,
      storage,
      latestBackup: latestBackup(),
      openModals: $$('.modal-bg.open,.modal-backdrop.open,#candidate-profile-modal.open,#candidate-profile-modal-v4.open,#v4-command.open,#command-modal.open,#quick-country-modal.open').map(x => x.id || x.className)
    };
    return result;
  }

  function installMutationStabilizer(){
    const mo = new MutationObserver(() => {
      clearTimeout(window.__drecoStabilityTick);
      window.__drecoStabilityTick = setTimeout(()=>{
        syncAuthShellState();
        labelMobileTables();
        ensureEmptyStates();
      }, 100);
    });
    document.addEventListener('DOMContentLoaded', () => {
      mo.observe(document.body, { childList:true, subtree:true, attributes:true, attributeFilter:['class','style'] });
    });
  }

  window.drecoRunHealthCheck = runHealthCheck;
  window.drecoCreateBackup = createBackup;
  window.drecoRestoreLatestBackup = restoreLatestBackup;
  window.drecoCloseAllModalsExcept = closeAllModalsExcept;
  window.drecoSyncAuthShellState = syncAuthShellState;

  installStorageGuard();
  installModalManager();
  installRenderGuards();
  installAuthStateWrappers();
  installMutationStabilizer();

  document.addEventListener('DOMContentLoaded', () => {
    syncAuthShellState();
    labelMobileTables();
    ensureEmptyStates();
    setTimeout(syncAuthShellState, 250);
    setTimeout(()=>runHealthCheck().then(res => {
      if (res.storage.supabaseClient && !res.storage.bucketReachable) {
        console.warn('Candidate document storage bucket check:', res.storage.error || 'Bucket not reachable');
      }
    }), 1200);
  });

  window.addEventListener('error', event => {
    console.error('Dreco runtime error:', event.error || event.message);
    showHealthMessage('Runtime issue caught', 'A script error was caught. Your saved candidate data was not overwritten.');
  });
  window.addEventListener('unhandledrejection', event => {
    console.error('Dreco async error:', event.reason);
    showHealthMessage('Sync/action issue caught', 'An action failed safely. Check the console for details.');
  });

  // ══════════════════════════════════════════════════════════
  // ⌘K COMMAND PALETTE
  // ══════════════════════════════════════════════════════════
  const CMD_TABS = [
    { label:'Dashboard',   icon:'ti-layout-dashboard', tab:'dash' },
    { label:'Candidates',  icon:'ti-users',          tab:'candidates' },
    { label:'Pipeline',    icon:'ti-briefcase',      tab:'pipeline' },
    { label:'Finance',     icon:'ti-wallet',         tab:'finance' },
    { label:'Documents',   icon:'ti-clipboard-text', tab:'documents' },
    { label:'Clients',     icon:'ti-building',       tab:'clients' },
    { label:'Reports',     icon:'ti-chart-line',     tab:'reports' },
  ];
  let cmdSelectedIdx = 0;

  window.openCmd = function() {
    const overlay = document.getElementById('cmd-overlay');
    if (!overlay) return;
    overlay.classList.add('open');
    const inp = document.getElementById('cmd-input');
    if (inp) { inp.value = ''; inp.focus(); }
    cmdSearch();
  };

  window.closeCmd = function() {
    const overlay = document.getElementById('cmd-overlay');
    if (overlay) overlay.classList.remove('open');
  };

  function cmdEsc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  window.cmdSearch = function() {
    const q = (document.getElementById('cmd-input')?.value || '').toLowerCase().trim();
    const results = document.getElementById('cmd-results');
    if (!results) return;
    cmdSelectedIdx = 0;

    const tabs = CMD_TABS.filter(t => !q || t.label.toLowerCase().includes(q));
    const candidates = q.length >= 2
      ? (typeof window._drecoAllRows === 'function' ? window._drecoAllRows() : []).filter(r =>
          (r.name||'').toLowerCase().includes(q) ||
          (r.pp||'').toLowerCase().includes(q) ||
          (r.company||'').toLowerCase().includes(q)
        ).slice(0, 8)
      : [];

    let html = '';
    if (tabs.length) {
      html += `<div class="cmd-section-label">Navigation</div>`;
      html += tabs.map((t,i) => `
        <div class="cmd-item${i===0&&!candidates.length?'':''}" data-cmd-idx="${i}" onclick="closeCmd();switchTab('${t.tab}')">
          <div class="cmd-item-icon"><i class="ti ${t.icon}"></i></div>
          <div class="cmd-item-main"><div class="cmd-item-name">${t.label}</div></div>
          <span class="cmd-item-badge">Tab</span>
        </div>`).join('');
    }
    if (candidates.length) {
      html += `<div class="cmd-section-label">Candidates</div>`;
      html += candidates.map((r,i) => `
        <div class="cmd-item" data-cmd-idx="${tabs.length+i}" onclick="closeCmd();editPro(${r.id})">
          <div class="cmd-item-icon"><i class="ti ti-user"></i></div>
          <div class="cmd-item-main">
            <div class="cmd-item-name">${cmdEsc(r.name)}</div>
            <div class="cmd-item-sub">${cmdEsc(r.stage||'')} · ${cmdEsc(r.company||'')}</div>
          </div>
        </div>`).join('');
    }
    if (!html) html = `<div id="cmd-empty">No results for "<strong>${q}</strong>"</div>`;
    results.innerHTML = html;
    highlightCmd();
  };

  window.cmdKey = function(e) {
    const items = document.querySelectorAll('.cmd-item');
    if (e.key === 'ArrowDown') { e.preventDefault(); cmdSelectedIdx = Math.min(cmdSelectedIdx+1, items.length-1); highlightCmd(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cmdSelectedIdx = Math.max(cmdSelectedIdx-1, 0); highlightCmd(); }
    else if (e.key === 'Enter') { e.preventDefault(); items[cmdSelectedIdx]?.click(); }
    else if (e.key === 'Escape') { closeCmd(); }
  };

  function highlightCmd() {
    document.querySelectorAll('.cmd-item').forEach((el,i) => {
      el.classList.toggle('selected', i === cmdSelectedIdx);
    });
  }

  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      const overlay = document.getElementById('cmd-overlay');
      if (overlay?.classList.contains('open')) closeCmd();
      else openCmd();
    }
    if (e.key === 'Escape') closeCmd();
  });
})();
