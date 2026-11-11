/* SpendWise — front-end application.
 * Demo mode uses localStorage so the UI can be explored immediately.
 * Set valid Supabase values in config.js and DEMO_MODE:false to use Supabase.
 */
(() => {
"use strict";
const cfg = window.SPENDWISE_CONFIG || {};
const ready = cfg.SUPABASE_URL?.includes(".supabase.co") && !cfg.SUPABASE_URL.includes("YOUR-") && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("YOUR_");
const supabase = ready && window.supabase ? window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY) : null;
const $ = id => document.getElementById(id);
const money = (n,c="INR") => new Intl.NumberFormat("en-IN",{style:"currency",currency:c,maximumFractionDigits:2}).format(Number(n)||0);
const dateNow = () => new Date().toISOString().slice(0,16);
const defaults = {
 transactions:[], budgets:[], goals:[], monthlyIncome:0, walletAdjustments:[], wallets:[{id:"w1",name:"Main Wallet",currency:"INR",balance:0}],
 categories:["Food & Dining","Shopping","Travel & Transport","Bills & Utilities","Education","Health & Medical","Entertainment","Rent & Housing","Groceries","Personal Care","Subscriptions","Other"],
 recurring:[], settings:{currency:"INR",theme:"dark"}
};
let state = structuredClone(defaults), user=null, page="dashboard", charts=[], pendingMfaFactorId=null, pendingMfaChallengeId=null;
function toast(msg){const el=document.createElement("div");el.className="toast";el.textContent=msg;$("toast-region").append(el);setTimeout(()=>el.remove(),3200);}
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function currentMonthTx(){const m=new Date().toISOString().slice(0,7);return state.transactions.filter(t=>t.date?.slice(0,7)===m);}
function amountInDisplayCurrency(t){
  const display=state.settings.currency||"INR";
  if(t.conversion_currency===display && Number.isFinite(Number(t.converted_amount))) return Number(t.converted_amount);
  if((t.currency||"INR")===display) return Number(t.amount)||0;
  return null; // Never add unlike currencies together without a recorded conversion rate.
}
function totals(list=state.transactions){return list.reduce((a,t)=>{const amount=amountInDisplayCurrency(t);if(amount===null)return a;if(t.type==="income")a.income+=amount;else a.expense+=amount;return a;},{income:0,expense:0});}
function baseAmount(t){return Number(t.converted_amount ?? t.amount);}
function setTheme(){document.body.classList.toggle("light",state.settings.theme==="light");}
function icons(){if(window.lucide)lucide.createIcons();}
function init(){setTheme();$("year").textContent=new Date().getFullYear();$("date-label").textContent=new Date().toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).toUpperCase();wire();if(supabase&&cfg.DEMO_MODE===false)checkSession();else{showAuth();$("auth-message").textContent="Production mode: configure your Supabase URL and public key in assets/js/config.js, then run sql/schema.sql. Demo mode is disabled.";}}
function wire(){
 $("side-nav").addEventListener("click",e=>{const b=e.target.closest("[data-page]");if(b)navigate(b.dataset.page);});
 document.addEventListener("click", e => {
  const btn = e.target.closest('[data-page="settings"]');
  if (btn) {
    e.preventDefault();
    navigate("settings");
  }
});
 $("mobile-nav").addEventListener("click",e=>{const b=e.target.closest("[data-page]");if(b)navigate(b.dataset.page);});
 $("quick-add").onclick=()=>openTransaction();
 $("theme-toggle").onclick=async()=>{state.settings.theme=state.settings.theme==="dark"?"light":"dark";setTheme();await saveProfile({theme:state.settings.theme});toast("Theme updated");};
 $("logout-btn").onclick=async()=>{if(supabase&&user){const {error}=await supabase.auth.signOut();if(error)return toast("Sign out failed: "+error.message);}user=null;showAuth();toast("Signed out");};
 $("transaction-form").addEventListener("submit",saveTransaction);
 ["close-transaction","cancel-transaction"].forEach(id=>$(id).onclick=()=>$("transaction-dialog").close());
 $("simple-close").onclick=$("simple-cancel").onclick=()=>$("simple-dialog").close();
 $("auth-toggle").onclick=()=>{const signup=$("auth-title").dataset.mode!=="signup";$("auth-title").dataset.mode=signup?"signup":"login";$("auth-title").textContent=signup?"Create your account":"Welcome to SpendWise";$("auth-submit").textContent=signup?"Create account":"Sign in";$("auth-toggle").textContent=signup?"Back to sign in":"Create an account";};
 $("auth-form").onsubmit=authSubmit;
 $("google-auth").onclick=async()=>{if(!supabase)return toast("Configure Supabase first.");const {error}=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:location.origin}});if(error)toast(error.message);};
 $("forgot-btn").onclick=forgotPassword;
}
async function checkSession(){const {data}=await supabase.auth.getSession();user=data.session?.user||null;supabase.auth.onAuthStateChange((_event,session)=>{user=session?.user||null;user?loadRemote():showAuth();});user?loadRemote():showAuth();}
function showDemo(){showAuth();$("auth-message").textContent="Demo mode is disabled. Connect a Supabase project to use SpendWise."; }
function showAuth(){$("app-view").classList.add("hidden");$("auth-view").classList.remove("hidden");}
async function authSubmit(e){e.preventDefault();if(!supabase){toast("Add Supabase credentials in config.js to enable sign-in.");return;}const email=$("auth-email").value.trim(),password=$("auth-password").value,signup=$("auth-title").dataset.mode==="signup";const result=signup?await supabase.auth.signUp({email,password}):await supabase.auth.signInWithPassword({email,password});if(result.error){$("auth-message").textContent=result.error.message;return;}if(signup){$("auth-message").textContent="Account created. Check your email if verification is enabled.";}else{user=result.data.user;await loadRemote();}}
async function forgotPassword(){if(!supabase){toast("Configure Supabase first.");return;}const email=$("auth-email").value.trim();if(!email)return toast("Enter your email address first.");const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin});toast(error?error.message:"Password reset email requested.");}
async function loadRemote(){
 if(!user||!supabase)return;
 const requests = await Promise.all([
  supabase.from("transactions").select("*").order("occurred_at",{ascending:false}).limit(5000),
  supabase.from("wallets").select("*").order("created_at",{ascending:true}),
  supabase.from("profiles").select("monthly_income,preferred_currency,theme,full_name").eq("id",user.id).maybeSingle(),
  supabase.from("wallet_adjustments").select("*").order("created_at",{ascending:false}).limit(5000),
  supabase.from("budgets").select("*").order("created_at",{ascending:false}),
  supabase.from("savings_goals").select("*").order("created_at",{ascending:false}),
  supabase.from("recurring_payments").select("*").order("created_at",{ascending:false}),
  supabase.from("categories").select("*").or(`user_id.is.null,user_id.eq.${user.id}`).order("name"),
  supabase.from("notifications").select("*").order("created_at",{ascending:false}).limit(100),
  supabase.from("notification_preferences").select("*").eq("user_id",user.id).maybeSingle()
 ]);
 const names=["transactions","wallets","profile","wallet adjustments","budgets","savings goals","recurring payments","categories","notifications","notification preferences"];
 for(let i=0;i<requests.length;i++){if(requests[i].error){toast("Backend "+names[i]+" error: "+requests[i].error.message);return;}}
 const [txRes,walletRes,profileRes,adjustRes,budgetRes,goalRes,recurringRes,categoryRes,notificationRes,prefsRes]=requests;
 state.transactions=(txRes.data||[]).map(r=>({id:r.id,type:r.type,amount:Number(r.amount),currency:r.currency,category:r.category,description:r.description,date:r.occurred_at,payment:r.payment_method,wallet_id:r.wallet_id,converted_amount:r.converted_amount,conversion_currency:r.conversion_currency,tags:(r.tags||[]).join(","),receipt_path:r.receipt_path}));
 state.wallets=walletRes.data||[]; state.walletAdjustments=adjustRes.data||[]; state.budgets=budgetRes.data||[];
 state.goals=(goalRes.data||[]).map(g=>({...g,saved:Number(g.saved_amount)||0,target:Number(g.target_amount)||0}));
 state.recurring=recurringRes.data||[]; state.categoryRows=categoryRes.data||[];
 state.categories=[...new Set([...defaults.categories,...state.categoryRows.map(c=>c.name)])];
 state.notifications=notificationRes.data||[];
 const {data:mfaData}=await supabase.auth.mfa.listFactors();state.mfaFactors=mfaData?.totp||[];
 state.notificationPreferences=prefsRes.data||{budget_alerts:true,goal_reminders:true,recurring_reminders:true,daily_summary:false,weekly_summary:true,monthly_summary:true,large_transaction_alerts:true,email_notifications:false};
 if(profileRes.data){state.monthlyIncome=Number(profileRes.data.monthly_income)||0;state.settings.currency=(profileRes.data.preferred_currency||"INR").trim();state.settings.theme=profileRes.data.theme||"dark";state.profileName=profileRes.data.full_name||"";}
 $("auth-view").classList.add("hidden");$("app-view").classList.remove("hidden");
 $("user-name").textContent=state.profileName||user.user_metadata?.full_name||user.email.split("@")[0];
 $("user-email").textContent=user.email;$("user-avatar").textContent=($("user-name").textContent||"U").trim().charAt(0).toUpperCase();
 setTheme();render();
}
function navigate(p){page=p;document.querySelectorAll("[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===p));render();}
function stat(title,value,icon,foot="Based on your recorded activity"){return `<article class="stat-card"><div class="stat-top"><span>${title}</span><span class="stat-icon"><i data-lucide="${icon}"></i></span></div><div class="stat-value">${value}</div><div class="stat-foot">${foot}</div></article>`;}
function empty(icon,msg){return `<div class="empty-state"><i data-lucide="${icon}"></i><div>${msg}</div></div>`;}
function txRows(list){if(!list.length)return empty("receipt-text","No transactions yet. Add your first transaction to see it here.");return list.slice(0,7).map(t=>`<div class="tx-row"><div class="tx-icon"><i data-lucide="${t.type==="income"?"trending-up":"shopping-bag"}"></i></div><div class="tx-info"><strong>${esc(t.description||t.category)}</strong><small>${esc(t.category)} · ${new Date(t.date).toLocaleDateString("en-IN")}</small></div><div class="tx-amount ${t.type==="income"?"positive":"negative"}">${t.type==="income"?"+":"−"}${money(t.amount,t.currency)}</div></div>`).join("");}
function walletCurrentBalance(w){
 const opening=Number(w.opening_balance??w.balance)||0;
 const movement=state.transactions.filter(t=>t.wallet_id===w.id&&(t.currency||"INR")===(w.currency||"INR")).reduce((n,t)=>n+(t.type==="income"?1:-1)*(Number(t.amount)||0),0);
 const adjustments=(state.walletAdjustments||[]).filter(a=>a.wallet_id===w.id).reduce((n,a)=>n+(a.direction==="add"?1:-1)*(Number(a.amount)||0),0);
 return opening+movement+adjustments;
}
function walletTotal(){
 const currency=state.settings.currency||"INR";
 return state.wallets.filter(w=>(w.currency||"INR")===currency).reduce((sum,w)=>{
   return sum+walletCurrentBalance(w);
 },0);
}
function dashboard(){
 const month=currentMonthTx(),spent=month.filter(t=>t.type==="expense"&&amountInDisplayCurrency(t)!==null).reduce((a,t)=>a+amountInDisplayCurrency(t),0);
 const income=Number(state.monthlyIncome)||0,left=income-spent;
 return `<div class="income-banner panel"><div><p class="eyebrow">YOUR MONTHLY PLAN</p><h2>Make every rupee count.</h2><p class="muted">Set your monthly income once. SpendWise will keep your remaining amount updated as you add expenses.</p></div><div class="income-banner-action"><div class="income-plan-value">${money(income,state.settings.currency)}</div><button class="btn primary" id="set-monthly-income"><i data-lucide="wallet"></i>${income?"Update monthly income":"Add monthly income"}</button></div></div>
 <div class="grid stats-grid">${stat("Monthly income",money(income,state.settings.currency),"wallet","Your planned income for this month")}${stat("Total spent",money(spent,state.settings.currency),"trending-down","Expenses recorded this month")}${stat("Money left",money(left,state.settings.currency),"piggy-bank",left>=0?"Available from your monthly income":"You have spent more than your plan")}${stat("Total account balance",money(walletTotal(),state.settings.currency),"landmark","Wallet balances in your display currency")}</div>
 <section class="panel chart-panel category-first-panel"><div class="panel-head"><div><h2>Spending by category</h2><p>Your category-wise expense breakdown for this month.</p></div><span class="pill">CATEGORY OVERVIEW</span></div><div class="chart-wrap category-first-chart"><canvas id="category-chart"></canvas></div><div id="category-summary" class="category-summary"></div></section>
 <section class="panel chart-panel"><div class="panel-head"><div><h2>Explore your money graphs</h2><p>Pie chart is the default. Switch the graph type whenever you want.</p></div><span class="pill">INTERACTIVE ANALYTICS</span></div><div class="chart-controls"><label>Data to analyse<select id="chart-metric"><option value="category" selected>Spending by category</option><option value="daily">Day-wise spending</option><option value="cashflow">Income vs expenses</option><option value="monthly">Monthly spending trend</option></select></label><label>Graph type<select id="chart-kind"><option value="pie" selected>Pie chart</option><option value="bar">Bar graph</option><option value="line">Line graph</option><option value="doughnut">Doughnut chart</option><option value="radar">Radar chart</option><option value="polarArea">Polar area chart</option></select></label></div><div class="chart-wrap main-chart"><canvas id="explore-chart"></canvas></div></section>
 <div class="grid content-grid"><section class="panel"><div class="panel-head"><div><h2>Recent transactions</h2><p>Your latest money movement</p></div><button class="panel-action" data-goto="transactions">View all</button></div><div class="transaction-list">${txRows([...state.transactions].sort((a,b)=>new Date(b.date)-new Date(a.date)))}</div></section><section class="panel"><div class="panel-head"><div><h2>Spending insight</h2><p>A quick read of your activity</p></div><i data-lucide="sparkles"></i></div>${insightHTML()}</section></div>`;
}
function insightHTML(){const m=currentMonthTx(),ex=m.filter(t=>t.type==="expense"&&amountInDisplayCurrency(t)!==null),sum=ex.reduce((a,t)=>a+amountInDisplayCurrency(t),0),top=Object.entries(ex.reduce((a,t)=>(a[t.category]=(a[t.category]||0)+amountInDisplayCurrency(t),a),{})).sort((a,b)=>b[1]-a[1])[0];return `<div class="feature-card"><span class="pill">MONTHLY INSIGHT</span><h2 style="margin:15px 0 8px">${top?esc(top[0]):"Your story starts here"}</h2><p class="muted" style="font-size:12px">${top?`Your highest recorded expense category this month is ${esc(top[0])}, at ${money(top[1])}. Total recorded expenses: ${money(sum)}.`:"Add transactions to unlock spending patterns, daily averages and practical budget suggestions."}</p></div>`;}
function transactionsPage(){return `<div class="panel"><div class="panel-head"><div><h2>All transactions</h2><p>Manage your income and expenses</p></div><button class="btn primary" id="page-add"><i data-lucide="plus"></i>Add transaction</button></div><div class="toolbar"><input id="tx-search" placeholder="Search transactions…"><select id="tx-filter"><option value="all">All types</option><option value="income">Income</option><option value="expense">Expense</option></select></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Details</th><th>Category</th><th>Date</th><th>Method</th><th>Amount</th><th>Actions</th></tr></thead><tbody id="tx-table">${transactionTable(state.transactions)}</tbody></table></div></div>`;}
function transactionTable(list){if(!list.length)return `<tr><td colspan="6">${empty("receipt","No matching transactions.")}</td></tr>`;return [...list].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(t=>`<tr><td><strong>${esc(t.description||t.category)}</strong></td><td>${esc(t.category)}</td><td>${new Date(t.date).toLocaleDateString("en-IN")}</td><td>${esc(t.payment||"—")}</td><td class="${t.type==="income"?"positive":"negative"}">${t.type==="income"?"+":"−"}${money(t.amount,t.currency)}</td><td><div class="table-actions"><button data-edit="${esc(t.id)}">Edit</button><button data-delete="${esc(t.id)}">Delete</button></div></td></tr>`).join("");}
function genericPage(){const configs={
 analytics:["Analytics & Reports","Compare daily activity, category patterns and longer-term cash flow.",`<div class="grid stats-grid">${stat("Recorded income",money(totals().income,state.settings.currency),"trending-up")}${stat("Recorded expenses",money(totals().expense,state.settings.currency),"trending-down")}${stat("Net cash flow",money(totals().income-totals().expense,state.settings.currency),"activity")}${stat("Transactions",state.transactions.length,"list")}</div><div class="section-title"><h2>Choose your graph</h2><div class="row-actions"><button class="panel-action" id="export-csv">Export CSV</button><button class="panel-action" id="export-pdf">Print / Save PDF</button></div></div><div class="panel chart-panel"><div class="chart-controls"><label>Data to analyse<select id="chart-metric"><option value="category" selected>Spending by category</option><option value="daily">Day-wise spending</option><option value="cashflow">Income vs expenses</option><option value="monthly">Monthly spending trend</option></select></label><label>Graph type<select id="chart-kind"><option value="pie" selected>Pie chart</option><option value="bar">Bar graph</option><option value="line">Line graph</option><option value="doughnut">Doughnut chart</option><option value="radar">Radar chart</option><option value="polarArea">Polar area chart</option></select></label></div><div class="chart-wrap main-chart"><canvas id="explore-chart"></canvas></div></div><div class="page-grid analytics-mini-grid"><div class="panel"><h2>Daily spending · Bar</h2><p class="muted">Each day of the current month</p><div class="chart-wrap"><canvas id="daily-chart"></canvas></div></div><div class="panel"><h2>Category split · Pie</h2><p class="muted">Where your money goes</p><div class="chart-wrap"><canvas id="category-chart"></canvas></div></div><div class="panel wide-panel"><h2>Income vs expenses · Line</h2><p class="muted">Six-month cash-flow trend</p><div class="chart-wrap"><canvas id="cashflow-chart"></canvas></div></div></div>`],
 budgets:["Budgets","Set spending limits and keep your plan on track.",`<div class="section-title"><h2>Your budgets</h2><button class="btn primary" id="add-budget">+ Add budget</button></div><div class="page-grid">${state.budgets.length?state.budgets.map(b=>{const spent=currentMonthTx().filter(t=>t.type==="expense"&&(b.category==="Overall"||t.category===b.category)&&amountInDisplayCurrency(t)!==null).reduce((a,t)=>a+amountInDisplayCurrency(t),0),pct=Math.min(100,spent/b.amount*100);return `<div class="panel"><div class="panel-head"><h2>${esc(b.category)}</h2><span class="pill">${pct.toFixed(0)}%</span></div><h2>${money(spent)} <span class="muted">/ ${money(b.amount)}</span></h2><div class="progress"><span style="width:${pct}%"></span></div><small class="muted">${pct>=100?"Budget limit reached":pct>=90?"Approaching your limit":money(Math.max(0,b.amount-spent))+" remaining"}</small><button class="panel-action danger-action" data-delete-budget="${esc(b.id)}">Delete budget</button></div>`}).join(""):empty("wallet","No budgets yet. Create an overall or category budget.")}</div>`],
 goals:["Savings Goals","Turn your plans into measurable progress.",`<div class="section-title"><h2>Your goals</h2><button class="btn primary" id="add-goal">+ Add goal</button></div><div class="page-grid">${state.goals.length?state.goals.map(g=>`<div class="panel"><div class="panel-head"><h2>${esc(g.name)}</h2><span class="pill">${Math.min(100,g.saved/g.target*100).toFixed(0)}%</span></div><h2>${money(g.saved)} <span class="muted">/ ${money(g.target)}</span></h2><div class="progress"><span style="width:${Math.min(100,g.saved/g.target*100)}%"></span></div><button class="panel-action" data-contribute="${esc(g.id)}">Add contribution</button><button class="panel-action danger-action" data-delete-goal="${esc(g.id)}">Delete goal</button></div>`).join(""):empty("target","No savings goals yet. Add your first goal.")}</div>`],
 wallets:["Wallets & Accounts","Manage wallet balances, add money, withdraw funds or remove wallets you no longer use.",`<div class="section-title"><div><h2>Your wallets</h2><p class="muted">Add money to a wallet or delete a wallet when you no longer need it.</p></div><button class="btn primary" id="add-wallet">+ Add wallet</button></div><div class="page-grid">${state.wallets.map(w=>`<div class="panel wallet-card"><div class="stat-top"><span>${esc(w.name)}</span><i data-lucide="landmark"></i></div><div class="stat-value">${money(walletCurrentBalance(w),w.currency||"INR")}</div><span class="pill">${esc(w.currency||"INR")}</span><div class="wallet-actions"><button class="btn primary" data-wallet-add="${esc(w.id)}">+ Add money</button><button class="btn ghost" data-wallet-withdraw="${esc(w.id)}">Withdraw</button><button class="panel-action danger-action" data-wallet-delete="${esc(w.id)}">Delete wallet</button></div></div>`).join("")||empty("wallet","No wallets yet. Create your first wallet.")}</div>`],
 recurring:["Recurring Payments","Keep subscriptions and repeating bills visible.",`<div class="section-title"><h2>Scheduled payments</h2><button class="btn primary" id="add-recurring">+ Add payment</button></div><div class="page-grid">${state.recurring.length?state.recurring.map(r=>`<div class="panel"><h2>${esc(r.name)}</h2><p class="muted">${esc(r.frequency)} · Next: ${esc(r.next_payment||"Not set")}</p><div class="stat-value">${money(r.amount,r.currency||state.settings.currency)}</div><button class="panel-action danger-action" data-delete-recurring="${esc(r.id)}">Delete payment</button></div>`).join(""):empty("repeat","No recurring payments added yet.")}</div>`],
 calendar:["Expense Calendar","A date-wise view of recorded transactions.",`<div class="panel"><div class="panel-head"><h2>${new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</h2></div><div class="page-grid">${state.transactions.filter(t=>t.type==="expense").map(t=>`<div class="feature-card"><span class="pill">${new Date(t.date).toLocaleDateString("en-IN")}</span><h2 style="margin-top:10px">${money(t.amount,t.currency)}</h2><p class="muted">${esc(t.category)} · ${esc(t.description||"Expense")}</p></div>`).join("")||empty("calendar-days","Your expense calendar will appear when you add transactions.")}</div></div>`],
 categories:["Manage Categories","Organise transactions with categories that make sense to you.",`<div class="section-title"><h2>Expense categories</h2><button class="btn primary" id="add-category">+ Add category</button></div><div class="page-grid">${state.categories.map(c=>`<div class="panel"><div class="stat-top"><strong>${esc(c)}</strong><span class="pill">Category</span></div>${(state.categoryRows||[]).some(x=>x.name===c&&x.user_id===user.id)?`<button class="panel-action danger-action" data-delete-category="${esc(c)}">Delete category</button>`:"<small class='muted'>Default category</small>"}</div>`).join("")}</div>`],
 notifications:["Notifications","Your alerts and financial reminders.",`<div class="panel"><div class="panel-head"><div><h2>Notification centre</h2><p class="muted">Your account notifications.</p></div><button class="panel-action" id="mark-notifications-read">Mark all read</button></div>${state.notifications?.length?state.notifications.map(n=>`<div class="tx-row"><div class="tx-icon"><i data-lucide="bell"></i></div><div class="tx-info"><strong>${esc(n.title)}</strong><small>${esc(n.body)} · ${new Date(n.created_at).toLocaleString("en-IN")}</small></div><span class="pill">${n.read_at?"Read":"New"}</span></div>`).join(""):empty("bell","You're all caught up.")}</div>`],
 settings:["Settings","Manage your account and personal preferences.",`<div class="page-grid"><div class="panel"><h2>Profile</h2><p class="muted">${esc(user?.email||"")}</p><label>Full name<input id="profile-name" value="${esc(state.profileName||"")}" maxlength="80"></label><button class="btn primary" id="save-profile-name">Save profile</button></div><div class="panel"><h2>Appearance</h2><p class="muted">Choose your preferred interface theme.</p><select id="setting-theme"><option value="dark" ${state.settings.theme==="dark"?"selected":""}>Dark Graphite</option><option value="light" ${state.settings.theme==="light"?"selected":""}>Light Silver</option></select></div><div class="panel"><h2>Default currency</h2><p class="muted">Dashboard display currency.</p><select id="setting-currency">${["INR","USD","EUR","GBP","AED","CAD","AUD","JPY"].map(c=>`<option ${state.settings.currency===c?"selected":""}>${c}</option>`).join("")}</select></div><div class="panel"><h2>Notifications</h2><p class="muted">Choose in-app reminders.</p>${["budget_alerts","goal_reminders","recurring_reminders","daily_summary","weekly_summary","monthly_summary","large_transaction_alerts"].map(k=>`<label class="check-row"><input type="checkbox" data-pref="${k}" ${state.notificationPreferences?.[k]?"checked":""}> ${k.replaceAll("_"," ")}</label>`).join("")}<button class="btn primary" id="save-notification-prefs">Save preferences</button></div><div class="panel"><h2>Two-step verification</h2><p class="muted">Protect sign-ins with an authenticator app.</p><span class="pill">${(state.mfaFactors||[]).some(f=>f.status==="verified")?"Authenticator enabled":"Not enabled"}</span><button class="btn primary" id="mfa-enroll">Set up authenticator</button><div id="mfa-setup"></div><label id="mfa-code-wrap" class="hidden">6-digit authenticator code<input id="mfa-code" inputmode="numeric" maxlength="6" placeholder="000000"></label><button class="btn primary hidden" id="mfa-verify">Verify code</button><button class="panel-action danger-action" id="mfa-disable">Disable authenticator</button></div><div class="panel"><h2>Account</h2><p class="muted">${esc(user?.email||"")}</p><button class="btn ghost" id="settings-logout">Sign out</button><button class="panel-action danger-action" id="delete-account">Delete account & data</button></div><div class="panel"><h2>Privacy & data</h2><p class="muted">Export your recorded transactions for your own backup.</p><button class="btn ghost" id="export-csv">Download CSV</button></div></div>`]
};const c=configs[page]||configs.analytics;return `<p class="muted" style="margin:0 0 22px">${c[1]}</p>${c[2]}`;}
let revealObserver=null;
function initScrollReveal(){
 if(revealObserver)revealObserver.disconnect();
 const nodes=[...document.querySelectorAll("#page-content .panel,#page-content .stat-card,#page-content .feature-card,#page-content .income-banner,#page-content .section-title")];
 if(!("IntersectionObserver" in window)){nodes.forEach(n=>n.classList.add("is-visible"));return;}
 revealObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting)entry.target.classList.add("is-visible");else entry.target.classList.remove("is-visible");}),{threshold:.12,rootMargin:"0px 0px -5% 0px"});
 nodes.forEach((node,i)=>{node.classList.add("scroll-reveal");node.style.setProperty("--reveal-delay",`${Math.min(i%5,4)*65}ms`);revealObserver.observe(node);});
}
function render(){if(!$("app-view").classList.contains("hidden")){$("page-title").textContent=({dashboard:"Dashboard",transactions:"Transactions","analytics":"Analytics & Reports",budgets:"Budgets",goals:"Savings Goals",wallets:"Wallets & Accounts",recurring:"Recurring Payments",calendar:"Expense Calendar",categories:"Manage Categories",notifications:"Notifications",settings:"Settings"})[page]||"Dashboard";$("page-content").innerHTML=page==="dashboard"?dashboard():page==="transactions"?transactionsPage():genericPage();bindPage();drawCharts();icons();addLiquidInteractions();animateCounters();initScrollReveal();}}
function graphData(metric){
 const cur=state.settings.currency||"INR",now=new Date(),colors=["#22d3ee","#818cf8","#c084fc","#f472b6","#fbbf24","#4ade80","#fb7185","#38bdf8","#a3e635","#f97316","#60a5fa","#e879f9"];
 if(metric==="daily"){
  const days=new Date(now.getFullYear(),now.getMonth()+1,0).getDate(),labels=Array.from({length:days},(_,i)=>String(i+1));
  const data=labels.map(day=>state.transactions.filter(t=>t.type==="expense"&&t.date?.slice(0,7)===now.toISOString().slice(0,7)&&new Date(t.date).getDate()===Number(day)&&amountInDisplayCurrency(t)!==null).reduce((a,t)=>a+amountInDisplayCurrency(t),0));
  return {labels,datasets:[{label:"Daily spending",data,backgroundColor:labels.map((_,i)=>colors[i%colors.length]),borderRadius:7,borderWidth:0}]};
 }
 if(metric==="category"){
  const groups=state.transactions.filter(t=>t.type==="expense"&&t.date?.slice(0,7)===now.toISOString().slice(0,7)&&amountInDisplayCurrency(t)!==null).reduce((a,t)=>(a[t.category]=(a[t.category]||0)+amountInDisplayCurrency(t),a),{});
  return {labels:Object.keys(groups),datasets:[{label:"Spending by category",data:Object.values(groups),backgroundColor:colors,borderWidth:1,borderColor:"rgba(255,255,255,.18)"}]};
 }
 if(metric==="cashflow"){
  const labels=Array.from({length:6},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-5+i,1);return d.toLocaleDateString("en-IN",{month:"short"});});
  const sums=type=>labels.map((_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-5+i,1),key=d.toISOString().slice(0,7);return state.transactions.filter(t=>t.type===type&&t.date?.slice(0,7)===key&&amountInDisplayCurrency(t)!==null).reduce((a,t)=>a+amountInDisplayCurrency(t),0)});
  return {labels,datasets:[{label:"Income",data:sums("income"),borderColor:"#22d3ee",backgroundColor:"rgba(34,211,238,.18)",tension:.35,fill:true},{label:"Expenses",data:sums("expense"),borderColor:"#f472b6",backgroundColor:"rgba(244,114,182,.12)",tension:.35,fill:true}]};
 }
 const labels=Array.from({length:6},(_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-5+i,1);return d.toLocaleDateString("en-IN",{month:"short"});});
 const data=labels.map((_,i)=>{const d=new Date(now.getFullYear(),now.getMonth()-5+i,1),key=d.toISOString().slice(0,7);return state.transactions.filter(t=>t.type==="expense"&&t.date?.slice(0,7)===key&&amountInDisplayCurrency(t)!==null).reduce((a,t)=>a+amountInDisplayCurrency(t),0)});
 return {labels,datasets:[{label:"Monthly spending",data,backgroundColor:colors,borderColor:"#818cf8",borderWidth:1,tension:.35,fill:false}]};
}
function makeChart(canvas,metric,kind){if(!canvas)return;let data=graphData(metric);const circular=["pie","doughnut","polarArea"].includes(kind);if(circular&&data.datasets.length>1){const labels=data.datasets.map(d=>d.label),values=data.datasets.map(d=>d.data.reduce((a,n)=>a+(Number(n)||0),0));data={labels,datasets:[{label:"Totals",data:values,backgroundColor:["#22d3ee","#f472b6"],borderWidth:1,borderColor:"rgba(255,255,255,.18)"}]};}charts.push(new Chart(canvas,{type:kind,data,options:{...chartOptions(),...(circular?{scales:{}}:{}),...(kind==="doughnut"?{cutout:"68%"}:{})}}));}
function drawCharts(){charts.forEach(c=>c.destroy());charts=[];if(!window.Chart)return;
 const explore=$("explore-chart"),metric=$("chart-metric")?.value||"category",kind=$("chart-kind")?.value||"pie";makeChart(explore,metric,kind);
 makeChart($("daily-chart"),"daily","bar");makeChart($("category-chart"),"category","pie");makeChart($("cashflow-chart"),"cashflow","line");
 const summary=$("category-summary");
 if(summary){
   const groups=state.transactions.filter(t=>t.type==="expense"&&t.date?.slice(0,7)===new Date().toISOString().slice(0,7)&&amountInDisplayCurrency(t)!==null).reduce((a,t)=>(a[t.category]=(a[t.category]||0)+amountInDisplayCurrency(t),a),{});
   const entries=Object.entries(groups).sort((a,b)=>b[1]-a[1]);
   summary.innerHTML=entries.length?entries.slice(0,5).map(([name,value],i)=>`<div class="category-summary-row"><span><i class="category-dot" style="--dot:${["#22d3ee","#f472b6","#a78bfa","#4ade80","#fbbf24"][i%5]}"></i>${esc(name)}</span><strong>${money(value,state.settings.currency)}</strong></div>`).join(""):`<p class="muted tiny">Add expense transactions to see your category breakdown.</p>`;
 }
}
function chartOptions(){return {responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:"#a1a1aa",boxWidth:8,font:{size:10}}}},scales:{x:{ticks:{color:"#a1a1aa"},grid:{color:"rgba(161,161,170,.08)"}},y:{ticks:{color:"#a1a1aa"},grid:{color:"rgba(161,161,170,.08)"}}}};}
function bindPage(){const add=$("page-add");if(add)add.onclick=()=>openTransaction();
 const incomeBtn=$("set-monthly-income");if(incomeBtn)incomeBtn.onclick=()=>simpleModal("Set monthly income",[{id:"income",label:"Your monthly income",type:"number",value:String(state.monthlyIncome||"")}],async v=>{const amount=Number(v.income);if(!Number.isFinite(amount)||amount<0)return toast("Enter a valid monthly income.");if(!supabase||!user)return toast("Supabase connection is required.");const {error}=await supabase.from("profiles").update({monthly_income:amount,preferred_currency:state.settings.currency}).eq("id",user.id);if(error)return toast("Income could not be saved: "+error.message);state.monthlyIncome=amount;render();toast("Monthly income saved");});
 const metricSelect=$("chart-metric"),kindSelect=$("chart-kind");if(metricSelect)metricSelect.onchange=drawCharts;if(kindSelect)kindSelect.onchange=drawCharts;const search=$("tx-search"),filter=$("tx-filter");if(search&&filter){const apply=()=>{const q=search.value.toLowerCase(),f=filter.value;const rows=state.transactions.filter(t=>(f==="all"||t.type===f)&&[t.description,t.category,t.payment].join(" ").toLowerCase().includes(q));$("tx-table").innerHTML=transactionTable(rows);bindTable();};search.oninput=filter.onchange=apply;bindTable();}
document.querySelectorAll("[data-goto]").forEach(b=>b.onclick=()=>navigate(b.dataset.goto));
if($("setting-theme"))$("setting-theme").onchange=async e=>{state.settings.theme=e.target.value;setTheme();await saveProfile({theme:state.settings.theme});};
if($("setting-currency"))$("setting-currency").onchange=async e=>{state.settings.currency=e.target.value;await saveProfile({preferred_currency:e.target.value});render();toast("Display currency updated");};
if($("save-profile-name"))$("save-profile-name").onclick=async()=>{const name=$("profile-name").value.trim();if(!name)return toast("Enter your name.");await saveProfile({full_name:name});render();toast("Profile updated");};
if($("settings-logout"))$("settings-logout").onclick=()=>$("logout-btn").click();
if($("mfa-enroll"))$("mfa-enroll").onclick=async()=>{const {data,error}=await supabase.auth.mfa.enroll({factorType:"totp",friendlyName:"SpendWise authenticator"});if(error)return toast(error.message);pendingMfaFactorId=data.id;const {data:challenge,error:challengeError}=await supabase.auth.mfa.challenge({factorId:data.id});if(challengeError)return toast(challengeError.message);pendingMfaChallengeId=challenge.id;$("mfa-setup").innerHTML=`<p class="muted">Scan this QR code with your authenticator app, or enter the secret manually.</p><img alt="Authenticator QR code" style="max-width:220px;background:white;padding:12px;border-radius:12px" src="${data.totp.qr_code}"><p class="tiny">Secret: <code>${esc(data.totp.secret)}</code></p>`;$("mfa-code-wrap").classList.remove("hidden");$("mfa-verify").classList.remove("hidden");};
if($("mfa-verify"))$("mfa-verify").onclick=async()=>{const code=$("mfa-code").value.trim();if(!/^\d{6}$/.test(code))return toast("Enter the 6-digit code.");const {error}=await supabase.auth.mfa.verify({factorId:pendingMfaFactorId,challengeId:pendingMfaChallengeId,code});if(error)return toast(error.message);toast("Two-step verification enabled.");await loadRemote();};
if($("mfa-disable"))$("mfa-disable").onclick=async()=>{const factor=(state.mfaFactors||[]).find(f=>f.status==="verified");if(!factor)return toast("No verified authenticator is enabled.");if(!confirm("Disable two-step verification?"))return;const {error}=await supabase.auth.mfa.unenroll({factorId:factor.id});if(error)return toast(error.message);toast("Authenticator disabled.");await loadRemote();};
if($("delete-account"))$("delete-account").onclick=async()=>{if(!confirm("Permanently delete your account and all associated SpendWise data? This cannot be undone."))return;const phrase=prompt('Type DELETE to confirm account removal');if(phrase!=="DELETE")return toast("Account deletion cancelled.");const {error}=await supabase.functions.invoke("delete-account");if(error)return toast("Account deletion failed: "+error.message);await supabase.auth.signOut();user=null;showAuth();toast("Account and associated data deleted.");};
if($("export-csv"))$("export-csv").onclick=exportCSV;
if($("export-pdf"))$("export-pdf").onclick=()=>window.print();
if($("save-notification-prefs"))$("save-notification-prefs").onclick=async()=>{const values={};document.querySelectorAll("[data-pref]").forEach(el=>values[el.dataset.pref]=el.checked);const {error}=await supabase.from("notification_preferences").upsert({user_id:user.id,...values});if(error)return toast(error.message);state.notificationPreferences={...state.notificationPreferences,...values};toast("Notification preferences saved");};
if($("mark-notifications-read"))$("mark-notifications-read").onclick=async()=>{const ids=(state.notifications||[]).filter(n=>!n.read_at).map(n=>n.id);if(!ids.length)return toast("No unread notifications.");const {error}=await supabase.from("notifications").update({read_at:new Date().toISOString()}).in("id",ids);if(error)return toast(error.message);state.notifications=state.notifications.map(n=>({...n,read_at:n.read_at||new Date().toISOString()}));render();};
if($("add-budget"))$("add-budget").onclick=()=>simpleModal("Add budget",[{id:"category",label:"Category (use Overall for total)",value:"Overall"},{id:"amount",label:"Monthly limit",type:"number"}],async v=>{const amount=Number(v.amount);if(!v.category.trim()||!Number.isFinite(amount)||amount<=0)return toast("Enter a category and a valid limit.");const {data,error}=await supabase.from("budgets").insert({user_id:user.id,category:v.category.trim(),amount,currency:state.settings.currency,period:"monthly"}).select().single();if(error)return toast(error.message);state.budgets.unshift(data);render();});
if($("add-goal"))$("add-goal").onclick=()=>simpleModal("Create savings goal",[{id:"name",label:"Goal name"},{id:"target",label:"Target amount",type:"number"},{id:"saved",label:"Already saved",type:"number",value:"0"},{id:"deadline",label:"Target date (optional)",type:"date"}],async v=>{const target=Number(v.target),saved=Number(v.saved)||0;if(!v.name.trim()||!Number.isFinite(target)||target<=0||saved<0)return toast("Enter a name and valid goal amounts.");const {data,error}=await supabase.from("savings_goals").insert({user_id:user.id,name:v.name.trim(),target_amount:target,saved_amount:saved,currency:state.settings.currency,deadline:v.deadline||null}).select().single();if(error)return toast(error.message);if(saved>0){const {error:ledgerError}=await supabase.from("goal_contributions").insert({user_id:user.id,goal_id:data.id,amount:saved,note:"Initial amount"});if(ledgerError)return toast(ledgerError.message);}state.goals.unshift({...data,target:Number(data.target_amount),saved:Number(data.saved_amount)});render();});
if($("add-wallet"))$("add-wallet").onclick=()=>simpleModal("Add wallet",[{id:"name",label:"Wallet name"},{id:"currency",label:"Currency (e.g. INR)",value:"INR"},{id:"balance",label:"Starting balance",type:"number",value:"0"}],async v=>{const amount=Number(v.balance),currency=v.currency.trim().toUpperCase();if(!v.name.trim()||!Number.isFinite(amount)||amount<0||currency.length!==3)return toast("Enter a wallet name, valid currency and non-negative balance.");if(supabase&&cfg.DEMO_MODE===false&&user){const {data,error}=await supabase.from("wallets").insert({user_id:user.id,name:v.name.trim(),currency,opening_balance:amount}).select().single();if(error)return toast("Could not create wallet: "+error.message);state.wallets.push(data); }else{return toast("Supabase connection is required. Demo mode is disabled.");}render();});
document.querySelectorAll("[data-wallet-add],[data-wallet-withdraw]").forEach(b=>b.onclick=()=>{const w=state.wallets.find(x=>x.id===(b.dataset.walletAdd||b.dataset.walletWithdraw));if(!w)return;const withdrawing=Boolean(b.dataset.walletWithdraw);simpleModal(withdrawing?"Withdraw from wallet":"Add money to wallet",[{id:"amount",label:`Amount (${w.currency||"INR"})`,type:"number",value:"0.01"},{id:"note",label:"Note (optional)"}],async v=>{const amount=Number(v.amount);if(!Number.isFinite(amount)||amount<=0)return toast("Enter a valid amount.");if(supabase&&cfg.DEMO_MODE===false&&user){const {error}=await supabase.rpc("adjust_wallet_balance",{p_wallet_id:w.id,p_amount:amount,p_direction:withdrawing?"withdraw":"add",p_note:v.note||null});if(error)return toast("Wallet update failed: "+error.message);await loadRemote(); }else{return toast("Supabase connection is required. Demo mode is disabled.");}toast(withdrawing?"Wallet withdrawal saved":"Money added to wallet");});});
document.querySelectorAll("[data-wallet-delete]").forEach(b=>b.onclick=async()=>{const w=state.wallets.find(x=>x.id===b.dataset.walletDelete);if(!w)return;if(!confirm(`Delete "${w.name}"? Transactions linked to this wallet will be kept but become unassigned.`))return;if(supabase&&cfg.DEMO_MODE===false&&user){const {error}=await supabase.from("wallets").delete().eq("id",w.id);if(error)return toast("Could not delete wallet: "+error.message);await loadRemote(); }else{return toast("Supabase connection is required. Demo mode is disabled.");}toast("Wallet deleted");});
if($("add-category"))$("add-category").onclick=()=>simpleModal("Add category",[{id:"name",label:"Category name"}],async v=>{const name=v.name.trim();if(!name)return toast("Enter a category name.");if(state.categories.some(c=>c.toLowerCase()===name.toLowerCase()))return toast("This category already exists.");const {data,error}=await supabase.from("categories").insert({user_id:user.id,name,kind:"expense",is_default:false}).select().single();if(error)return toast(error.message);state.categories.push(data.name);state.categoryRows=[...(state.categoryRows||[]),data];render();});
if($("add-recurring"))$("add-recurring").onclick=()=>simpleModal("Add recurring payment",[{id:"name",label:"Payment name"},{id:"amount",label:"Amount",type:"number"},{id:"frequency",label:"Frequency",value:"monthly"},{id:"next",label:"Next payment date",type:"date"},{id:"category",label:"Category",value:"Subscriptions"}],async v=>{const amount=Number(v.amount),frequency=v.frequency.toLowerCase();if(!v.name.trim()||!Number.isFinite(amount)||amount<=0||!["daily","weekly","monthly","yearly"].includes(frequency))return toast("Enter valid recurring payment details.");const {data,error}=await supabase.from("recurring_payments").insert({user_id:user.id,name:v.name.trim(),amount,currency:state.settings.currency,frequency,next_payment:v.next||null,category:v.category||null,active:true}).select().single();if(error)return toast(error.message);state.recurring.unshift(data);render();});
document.querySelectorAll("[data-contribute]").forEach(b=>b.onclick=()=>{const g=state.goals.find(x=>x.id===b.dataset.contribute);simpleModal("Add savings contribution",[{id:"amount",label:"Contribution amount",type:"number"},{id:"note",label:"Note (optional)"}],async v=>{const amount=Number(v.amount);if(!Number.isFinite(amount)||amount<=0)return toast("Enter a valid contribution.");const {error:ledgerError}=await supabase.from("goal_contributions").insert({user_id:user.id,goal_id:g.id,amount,note:v.note||null});if(ledgerError)return toast(ledgerError.message);const {data,error}=await supabase.from("savings_goals").update({saved_amount:Number(g.saved)+amount}).eq("id",g.id).select().single();if(error)return toast(error.message);g.saved=Number(data.saved_amount);render();});});
document.querySelectorAll("[data-delete-budget]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete this budget?"))return;const {error}=await supabase.from("budgets").delete().eq("id",b.dataset.deleteBudget);if(error)return toast(error.message);state.budgets=state.budgets.filter(x=>x.id!==b.dataset.deleteBudget);render();});
document.querySelectorAll("[data-delete-goal]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete this savings goal and its contribution history?"))return;const {error}=await supabase.from("savings_goals").delete().eq("id",b.dataset.deleteGoal);if(error)return toast(error.message);state.goals=state.goals.filter(x=>x.id!==b.dataset.deleteGoal);render();});
document.querySelectorAll("[data-delete-recurring]").forEach(b=>b.onclick=async()=>{if(!confirm("Delete this recurring payment?"))return;const {error}=await supabase.from("recurring_payments").delete().eq("id",b.dataset.deleteRecurring);if(error)return toast(error.message);state.recurring=state.recurring.filter(x=>x.id!==b.dataset.deleteRecurring);render();});
document.querySelectorAll("[data-delete-category]").forEach(b=>b.onclick=async()=>{const c=b.dataset.deleteCategory;if(!confirm(`Delete category "${c}"? Existing transactions keep their saved category.`))return;const row=(state.categoryRows||[]).find(x=>x.name===c&&x.user_id===user.id);if(!row)return toast("Default categories cannot be deleted.");const {error}=await supabase.from("categories").delete().eq("id",row.id);if(error)return toast(error.message);state.categories=state.categories.filter(x=>x!==c);state.categoryRows=state.categoryRows.filter(x=>x.id!==row.id);render();});
document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>{const t=state.transactions.find(x=>x.id===b.dataset.edit);openTransaction(t);});
document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>deleteTransaction(b.dataset.delete));
}
function bindTable(){document.querySelectorAll("[data-edit]").forEach(b=>b.onclick=()=>openTransaction(state.transactions.find(x=>x.id===b.dataset.edit)));document.querySelectorAll("[data-delete]").forEach(b=>b.onclick=()=>deleteTransaction(b.dataset.delete));}
function openTransaction(t=null){$("transaction-modal-title").textContent=t?"Edit transaction":"Add transaction";$("transaction-id").value=t?.id||"";$("tx-type").value=t?.type||"expense";$("tx-amount").value=t?.amount||"";$("tx-currency").value=t?.currency||state.settings.currency;$("tx-category").innerHTML=state.categories.map(c=>`<option ${t?.category===c?"selected":""}>${esc(c)}</option>`).join("");$("tx-date").value=t?.date?.slice(0,16)||dateNow();$("tx-payment").value=t?.payment||"UPI";$("tx-wallet").innerHTML='<option value="">No wallet selected</option>'+state.wallets.map(w=>`<option value="${esc(w.id)}" ${t?.wallet_id===w.id?"selected":""}>${esc(w.name)}</option>`).join("");$("tx-tags").value=t?.tags||"";$("tx-description").value=t?.description||"";$("tx-receipt").value="";$("transaction-dialog").showModal();}
async function saveTransaction(e){
 e.preventDefault();
 if(!supabase||cfg.DEMO_MODE!==false||!user)return toast("Connect Supabase before saving transactions.");
 const id=$("transaction-id").value;
 const amount=Number($("tx-amount").value);
 if(!Number.isFinite(amount)||amount<=0)return toast("Enter a valid amount.");
 const occurredAt=new Date($("tx-date").value);
 if(Number.isNaN(occurredAt.getTime()))return toast("Choose a valid transaction date.");
 let receiptPath=id?(state.transactions.find(x=>x.id===id)?.receipt_path||null):null;
 const file=$("tx-receipt").files?.[0];
 if(file){
  if(file.size>5*1024*1024)return toast("Receipt must be 5 MB or smaller.");
  if(!["image/jpeg","image/png","image/webp","application/pdf"].includes(file.type))return toast("Unsupported receipt file type.");
  const path=`${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
  const {error:uploadError}=await supabase.storage.from("receipts").upload(path,file,{contentType:file.type,upsert:false});
  if(uploadError)return toast("Receipt upload failed: "+uploadError.message);
  receiptPath=path;
 }
 const row={
  user_id:user.id,type:$("tx-type").value,amount,currency:$("tx-currency").value,
  category:$("tx-category").value,occurred_at:occurredAt.toISOString(),
  payment_method:$("tx-payment").value,wallet_id:$("tx-wallet").value||null,
  description:$("tx-description").value.trim(),
  tags:$("tx-tags").value.split(",").map(x=>x.trim()).filter(Boolean),
  receipt_path:receiptPath
 };
 const result=id
  ?await supabase.from("transactions").update(row).eq("id",id).select().single()
  :await supabase.from("transactions").insert(row).select().single();
 if(result.error)return toast(result.error.message);
 $("transaction-dialog").close();
 await loadRemote();
 await evaluateTransactionAlerts({type:row.type,amount:row.amount,currency:row.currency,category:row.category});
 toast(id?"Transaction updated":"Transaction saved");
}
async function evaluateTransactionAlerts(transaction){
 if(!user||!supabase)return;
 const prefs=state.notificationPreferences||{};
 if(transaction.type==="expense"&&prefs.large_transaction_alerts!==false&&transaction.amount>=5000){
  await supabase.from("notifications").insert({user_id:user.id,title:"Large transaction recorded",body:`${money(transaction.amount,transaction.currency)} · ${transaction.category}`});
 }
 if(transaction.type!=="expense"||prefs.budget_alerts===false)return;
 const monthSpend=currentMonthTx().filter(t=>t.type==="expense"&&(t.currency||"INR")===state.settings.currency).reduce((n,t)=>n+Number(t.amount||0),0);
 for(const budget of state.budgets){
  if((budget.currency||"INR")!==state.settings.currency)continue;
  const spent=currentMonthTx().filter(t=>t.type==="expense"&&(budget.category==="Overall"||t.category===budget.category)&&(t.currency||"INR")===state.settings.currency).reduce((n,t)=>n+Number(t.amount||0),0);
  const pct=spent/Number(budget.amount)*100;
  const threshold=pct>=100?100:pct>=90?90:pct>=75?75:null;
  if(threshold){
   const title=`${budget.category} budget ${threshold}% reached`;
   const {data:existing}=await supabase.from("notifications").select("id").eq("user_id",user.id).eq("title",title).gte("created_at",new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString()).limit(1);
   if(!existing?.length)await supabase.from("notifications").insert({user_id:user.id,title,body:`You've spent ${money(spent,state.settings.currency)} of ${money(budget.amount,state.settings.currency)} this month.`});
  }
 }
}
async function deleteTransaction(id){if(!confirm("Delete this transaction? This cannot be undone."))return;if(!supabase||cfg.DEMO_MODE!==false||!user)return toast("Supabase connection is required.");const tx=state.transactions.find(t=>t.id===id);if(tx?.receipt_path){const {error:storageError}=await supabase.storage.from("receipts").remove([tx.receipt_path]);if(storageError)return toast("Could not remove receipt: "+storageError.message);}const {error}=await supabase.from("transactions").delete().eq("id",id);if(error)return toast(error.message);await loadRemote();toast("Transaction deleted");}
function simpleModal(title,fields,onSave){$("simple-title").textContent=title;$("simple-fields").innerHTML=fields.map(f=>`<label style="margin:12px 0">${esc(f.label)}<input id="simple-${f.id}" type="${f.type||"text"}" value="${esc(f.value||"")}" required></label>`).join("");$("simple-form").onsubmit=e=>{e.preventDefault();const v={};fields.forEach(f=>v[f.id]=$("simple-"+f.id).value);$("simple-dialog").close();onSave(v);};$("simple-dialog").showModal();}
function persist(){toast("This action requires an authenticated Supabase connection.");}
async function saveProfile(values){if(!supabase||!user)return toast("Supabase connection is required.");const {error}=await supabase.from("profiles").update(values).eq("id",user.id);if(error)toast("Profile update failed: "+error.message);else if(values.full_name!==undefined){state.profileName=values.full_name;$("user-name").textContent=values.full_name||user.email.split("@")[0];}}
function exportCSV(){const rows=[["Date","Type","Amount","Currency","Category","Payment method","Description"],...state.transactions.map(t=>[t.date,t.type,t.amount,t.currency,t.category,t.payment,t.description])];const csv=rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="spendwise-transactions.csv";a.click();URL.revokeObjectURL(a.href);toast("CSV export downloaded");}

function addLiquidInteractions(){
 document.querySelectorAll(".stat-card,.panel,.feature-card,.auth-card").forEach(el=>{
   el.classList.add("liquid-highlight");
   el.onpointermove=e=>{const r=el.getBoundingClientRect();el.style.setProperty("--mx",(e.clientX-r.left)+"px");el.style.setProperty("--my",(e.clientY-r.top)+"px");
     if(e.pointerType==="mouse"&&el.classList.contains("stat-card")){const x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;el.style.transform=`perspective(900px) rotateX(${-y*5}deg) rotateY(${x*6}deg) translateY(-4px)`;}
   };
   el.onpointerleave=()=>{el.style.transform="";el.style.removeProperty("--mx");el.style.removeProperty("--my");};
 });
}
function animateCounters(){
 document.querySelectorAll(".stat-value").forEach(el=>{
   if(el.dataset.animated==="yes")return;el.dataset.animated="yes";
   const raw=el.textContent.trim();const match=raw.match(/^([^0-9-]*)([0-9,]+(?:\.[0-9]+)?)(.*)$/);
   if(!match)return;const target=Number(match[2].replace(/,/g,""));if(!Number.isFinite(target)||target===0)return;
   const prefix=match[1],suffix=match[3],start=performance.now(),duration=650;
   function tick(now){const p=Math.min(1,(now-start)/duration),ease=1-Math.pow(1-p,3),v=target*ease;el.textContent=prefix+v.toLocaleString("en-IN",{maximumFractionDigits:2})+suffix;if(p<1)requestAnimationFrame(tick);}
   el.textContent=prefix+"0"+suffix;requestAnimationFrame(tick);
 });
}

init();
})();