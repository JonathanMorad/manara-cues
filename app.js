(function(){
"use strict";

/* ===== constants ===== */
var ROLES = [{id:"director",label:"Director"},{id:"actor",label:"Actor"},{id:"writer",label:"Writer"},{id:"sound",label:"Sound"},{id:"lighting",label:"Lighting"}];
var SOUND = [
  {id:"play",label:"Play",color:"var(--a-play)"},{id:"fadein",label:"Fade in",color:"var(--a-fadein)"},{id:"fadeout",label:"Fade out",color:"var(--a-fadeout)"},
  {id:"volup",label:"Volume up",color:"var(--a-volup)"},{id:"duck",label:"Volume down",color:"var(--a-duck)"},{id:"stop",label:"Stop",color:"var(--a-stop)"}];
var LIGHT = [
  {id:"lfadein",label:"Fade in",color:"var(--a-fadein)"},{id:"lfadeout",label:"Fade out",color:"var(--a-fadeout)"},{id:"flicker",label:"Flicker",color:"var(--a-flicker)"}];
var SWATCHES = ["#FFFFFF","#FFD27A","#FF8A3D","#E5484D","#E255A1","#8E6BFF","#3E8BFF","#2CC6A0"];

/* ===== state ===== */
var DB = null;
var S = {ready:false, user:null, needsSetup:false, users:[], prods:[], pid:null, cues:[], notes:[], events:[], publicShows:[], responses:{}, scripts:[], highlights:[],
  tab:"home", lastTab:null, prodView:"overview", lastProdView:null, calMonth:null, calSelected:"", calMode:"month", theme:"system", lang:"en", form:{}, sceneId:null, dept:"all", live:null, sheet:null, toast:"", dirty:false, authErr:"", busy:false, fatal:""};
var unsub = {users:null, prods:null, cues:null, notes:null, events:null, publicShows:null, highlights:null, scripts:null, responses:{}};

/* ===== helpers ===== */
function uid(){ return Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-3); }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
function fmt(sec){ sec=Math.round(sec||0); var m=Math.floor(sec/60), s=sec%60; return m+":"+(s<10?"0":"")+s; }
function parseLen(t){ t=String(t||"").trim(); if(!t) return 0; if(t.indexOf(":")>-1){ var p=t.split(":"); return Math.max(0,(parseInt(p[0],10)||0)*60+(parseInt(p[1],10)||0)); } var n=parseInt(t,10); return isNaN(n)?0:Math.max(0,n); }
function roleList(value){ return Array.isArray(value)?value:(value?[value]:[]); }
function roleLabel(value){ return roleList(value).map(function(id){ var label=""; for(var i=0;i<ROLES.length;i++) if(ROLES[i].id===id) label=ROLES[i].label; if(!label)label=id==="admin"?"Admin":"Member"; if(S.lang==="ar")return ({director:"مخرج",actor:"ممثل",writer:"كاتب",sound:"صوت",lighting:"إضاءة",admin:"مشرف",member:"عضو"})[id]||label; return label; }).join(" · "); }
function actionsFor(dept){ return dept==="lighting"?LIGHT:SOUND; }
function actionOf(dept,id){ var a=actionsFor(dept); for(var i=0;i<a.length;i++) if(a[i].id===id) return a[i]; return a[0]; }
function userById(id){ for(var i=0;i<S.users.length;i++) if(S.users[i].uid===id) return S.users[i]; return null; }
function nameOf(id){ var u=userById(id); return u?u.name:"Someone"; }
function initials(n){ var p=String(n||"?").trim().split(/\s+/); return ((p[0]||"?")[0]+(p[1]?p[1][0]:"")).toUpperCase(); }
function prod(){ for(var i=0;i<S.prods.length;i++) if(S.prods[i].id===S.pid) return S.prods[i]; return null; }
function isAdmin(){ return !!(S.user&&S.user.isAdmin); }
function myRoles(){ var p=prod(); return roleList(p&&S.user&&p.members&&p.members[S.user.uid]); }
function myRole(){ return myRoles()[0]||null; }
function isDirector(){ return isAdmin()||myRoles().indexOf("director")>-1; }
function canEditDept(d){ return isDirector()||myRoles().indexOf(d)>-1; }
function canEditScript(){ return isDirector()||myRoles().indexOf("writer")>-1; }
function myDepts(){ if(isDirector()) return ["sound","lighting"]; return myRoles().filter(function(r){ return r==="sound"||r==="lighting"; }); }
function canRunLiveMode(){ return isDirector()||myRoles().indexOf("sound")>-1||myRoles().indexOf("lighting")>-1; }
function scene(){ var p=prod(); if(!p) return null; for(var i=0;i<p.scenes.length;i++) if(p.scenes[i].id===S.sceneId) return p.scenes[i]; S.sceneId=p.scenes[0]?p.scenes[0].id:null; return p.scenes[0]||null; }
function sceneIndex(id){ var p=prod(); if(!p) return 99; for(var i=0;i<p.scenes.length;i++) if(p.scenes[i].id===id) return i; return 99; }
function sortedCues(dept){
  return S.cues.filter(function(c){ return c.dept===dept; }).sort(function(a,b){ return sceneIndex(a.sceneId)-sceneIndex(b.sceneId) || (a.order||0)-(b.order||0); });
}
function numberOf(c){ var list=sortedCues(c.dept); for(var i=0;i<list.length;i++) if(list[i].id===c.id) return (c.dept==="lighting"?"L":"Q")+(i+1); return "?"; }
function watchCurrentHighlights(){
  if(unsub.highlights){try{unsub.highlights();}catch(e){} unsub.highlights=null;}
  S.highlights=[];
  var p=prod(), sc=scene();
  if(p&&sc&&S.user&&S.tab==="production"&&S.prodView==="script")
    unsub.highlights=DB.watchHighlights(p.id,sc.id,S.user.uid,function(rows){S.highlights=rows||[];softRender();});
}
function toast(msg){ S.toast=msg; render(); setTimeout(function(){ if(S.toast===msg){ S.toast=""; render(); } },2600); }
function err(e){ return (e&&e.message)||"Something went wrong."; }
function absorb(p,label){ return p.catch(function(e){ toast((label||"Could not save")+": "+err(e)); }); }
function effectiveTheme(){ return S.theme==="system"?((window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light"):S.theme; }
function applyTheme(){
  if(S.theme==="system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme",S.theme);
  var meta=document.querySelector('meta[name="theme-color"]');
  if(meta) meta.content=effectiveTheme()==="dark"?"#111214":"#F1F0ED";
}
var AR_TEXT={"Loading…":"جارٍ التحميل…","Username":"اسم المستخدم","Code":"رمز الدخول","Sign in":"تسجيل الدخول","Your username and code come from your team admin.":"تحصل على اسم المستخدم ورمز الدخول من مسؤول الفريق.","Current production":"الإنتاج الحالي","No production selected":"لم يتم اختيار إنتاج","Productions":"الإنتاجات","Choose a production":"اختر إنتاجًا","No productions yet.":"لا توجد إنتاجات بعد.","New production":"إنتاج جديد","Home":"الرئيسية","Calendar":"التقويم","Production":"الإنتاج","Team":"الفريق","Your part":"دورك","Next date":"الموعد القادم","Production materials":"مواد الإنتاج","Read the script, your role cues, and rehearsal notes in one place.":"اقرأ النص وإشارات دورك وملاحظات البروفات في مكان واحد.","Open calendar":"افتح التقويم","Nothing scheduled yet.":"لا توجد مواعيد بعد.","Script":"النص","Cues":"الإشارات","Notes":"الملاحظات","Rehearsal":"بروفة","Production / show":"عرض","Month":"شهر","Agenda":"قائمة","Today":"اليوم","Add date":"أضف موعدًا","Visible to all Manara users. RSVPs are for members of this production.":"مواعيد العروض ظاهرة لجميع مستخدمي منارة. تأكيد الحضور متاح لأعضاء هذا الإنتاج.","This rehearsal is for selected members of this production.":"هذه البروفة مخصصة للأعضاء المحددين في هذا الإنتاج.","Select text, then choose a color. Only you can see your highlights.":"حدد النص ثم اختر لونًا. تمييزاتك تظهر لك وحدك.","Yellow":"أصفر","Green":"أخضر","Pink":"وردي","Blue":"أزرق","Clear mine":"امسح تمييزاتي","Edit":"تعديل","Add text":"أضف النص","Change my code":"غيّر رمز دخولي","Sign out":"تسجيل الخروج","Add":"إضافة","Everyone with an account":"كل أصحاب الحسابات","New person":"شخص جديد","Nobody added yet.":"لم تتم إضافة أحد بعد.","Rename production or edit scenes":"غيّر اسم الإنتاج أو عدّل المشاهد","Edit production":"تعديل الإنتاج","Production name":"اسم الإنتاج","Scenes":"المشاهد","Type a scene name, then press Next. Add or move scenes with the controls.":"اكتب اسم المشهد ثم اضغط التالي. أضف المشاهد أو حرّكها باستخدام الأزرار.","Cancel":"إلغاء","Create":"إنشاء","Save":"حفظ","Roles":"الأدوار","A person can have more than one role in this production.":"يمكن للشخص أن يؤدي أكثر من دور في هذا الإنتاج.","Save roles":"حفظ الأدوار","Remove from production":"إزالة من الإنتاج","Tap again to remove":"اضغط مرة أخرى للإزالة","Character / part in this production":"الشخصية / الدور في هذا الإنتاج","e.g. Layla":"مثال: ليلى","Assign the character or part this person plays in this production.":"حدد الشخصية أو الدور الذي يؤديه هذا الشخص في هذا الإنتاج.","Director":"مخرج","Actor":"ممثل","Writer":"كاتب","Sound":"صوت","Lighting":"إضاءة","Member":"عضو","Admin":"مشرف","Close":"إغلاق","Everyone with an account is already in this production. An admin can create new accounts in the Team tab.":"كل أصحاب الحسابات موجودون بالفعل في هذا الإنتاج. يمكن للمشرف إنشاء حسابات جديدة من صفحة الفريق.","Choose every role this person has in this production.":"اختر كل الأدوار التي يؤديها هذا الشخص في هذا الإنتاج.","Choose a person and at least one role.":"اختر شخصًا ودورًا واحدًا على الأقل.","Choose at least one role.":"اختر دورًا واحدًا على الأقل.","Playing:":"يجسد شخصية:","Add cue":"أضف إشارة","Add note":"أضف ملاحظة","Notes for you":"ملاحظات لك","Private notes are only visible to you.":"الملاحظات الخاصة لا يراها سواك.","To myself":"لنفسي","To a person":"لشخص","Send to":"إرسال إلى","No one else is in this production yet.":"لا يوجد أحد غيرك في هذا الإنتاج بعد.","Who can RSVP?":"من يمكنه تأكيد الحضور؟","Who should see this rehearsal?":"من يمكنه رؤية هذه البروفة؟","All production members":"كل أعضاء الإنتاج","Clear selection":"إلغاء التحديد","Show dates are visible to all Manara users. Only selected production members can RSVP.":"مواعيد العروض ظاهرة لجميع مستخدمي منارة. يمكن لأعضاء الإنتاج المحددين تأكيد الحضور.","Only selected people in this production can see this rehearsal. Directors are always included.":"الأشخاص المحددون فقط في هذا الإنتاج يرون هذه البروفة. يُضاف المخرجون دائمًا.","Create admin":"إنشاء حساب المشرف","First-time setup":"الإعداد الأول","Create the admin account. You will use it to add everyone else.":"أنشئ حساب المشرف، وستستخدمه لإضافة بقية الفريق.","Your name":"اسمك","Code (at least 6 characters)":"رمز الدخول (6 أحرف على الأقل)","Writer":"كاتب","Arabic":"عربي","Switch language":"تغيير اللغة","☼ Light":"☼ فاتح","◐ Dark":"◐ داكن","Previous month":"الشهر السابق","Next month":"الشهر التالي","Previous scene":"المشهد السابق","Next scene":"المشهد التالي","Sound":"صوت","Lighting":"إضاءة","All":"الكل","Play":"تشغيل","Fade in":"زيادة تدريجية","Fade out":"خفض تدريجي","Volume up":"رفع الصوت","Volume down":"خفض الصوت","Stop":"إيقاف","Flicker":"وميض","Account created.":"تم إنشاء الحساب.","Full name":"الاسم الكامل","Also make this person an admin":"اجعل هذا الشخص مشرفًا أيضًا","Create account":"إنشاء الحساب","Details":"التفاصيل","Private":"خاص","To myself":"لنفسي","To a person":"لشخص","New note":"ملاحظة جديدة","New cue":"إشارة جديدة","Save cue":"حفظ الإشارة","Trigger (the line or action that cues it)":"المحفّز (الجملة أو الحركة التي تبدأ الإشارة)","Track or sound":"المسار أو الصوت","Note for the booth":"ملاحظة لمقصورة التحكم","Who is it for":"لمن هذه الملاحظة؟","Add rehearsal":"أضف بروفة","Edit date":"تعديل الموعد","Delete":"حذف","Going":"سأحضر","Not going":"لن أحضر","Days until":"الأيام المتبقية","Search":"بحث","Save date":"حفظ الموعد","Rehearsal / show":"بروفة / عرض","Writing":"كتابة","Copy details":"نسخ التفاصيل","Done":"تم"};
function applyLanguage(){
  var ar=S.lang==="ar", root=document.documentElement;
  root.lang=ar?"ar":"en"; root.dir=ar?"rtl":"ltr";
  if(!ar)return;
  var app=document.getElementById("app"), walker=document.createTreeWalker(app,NodeFilter.SHOW_TEXT), node;
  while((node=walker.nextNode())){if(node.parentElement&&node.parentElement.closest(".script-text"))continue;var raw=node.nodeValue,trim=raw.trim(),translated=AR_TEXT[trim];if(translated)node.nodeValue=raw.replace(trim,translated);}
  app.querySelectorAll("[aria-label],[title],[placeholder]").forEach(function(el){["aria-label","title","placeholder"].forEach(function(a){var v=el.getAttribute(a);if(v&&AR_TEXT[v])el.setAttribute(a,AR_TEXT[v]);});});
}
Object.assign(AR_TEXT,{"Coming up":"قريبًا","scene":"مشهد","scenes":"مشاهد","people":"أشخاص","Tomorrow":"غدًا","No upcoming dates yet.":"لا توجد مواعيد قادمة.","Nothing from the director yet.":"لا توجد ملاحظات من المخرج بعد.","See all notes":"عرض كل الملاحظات","Open Live mode":"افتح وضع العرض","Overview":"نظرة عامة","Scenes":"المشاهد","Add a scene to start the script.":"أضف مشهدًا لبدء النص.","The director has not added this scene’s script yet.":"لم يضف المخرج نص هذا المشهد بعد.","Select text, then choose a color. Only you can see your highlights.":"حدد النص ثم اختر لونًا. تمييزاتك تظهر لك وحدك.","Only you can see this note.":"لا يرى هذه الملاحظة سواك.","Private notes are only visible to you. Notes you send to a person are visible to them and to you.":"لا يطلع على ملاحظاتك الخاصة سواك. الملاحظات المرسلة لشخص يراها هو وأنت.","Notes from the director appear here.":"تظهر هنا ملاحظات المخرج.","No dates yet. A director can add rehearsals and production dates.":"لا توجد مواعيد بعد. يمكن للمخرج إضافة البروفات والعروض.","Nothing scheduled for this day.":"لا توجد مواعيد لهذا اليوم.","No rehearsals or production dates yet. A director can add the first date.":"لا توجد بروفات أو عروض بعد. يمكن للمخرج إضافة أول موعد.","All production members":"كل أعضاء الإنتاج","Add a date":"أضف موعدًا","Name":"الاسم","Date":"التاريخ","Time":"الوقت","Production":"عرض","Edit date":"تعديل الموعد","Save date":"حفظ الموعد","Visible to all Manara users. RSVPs are for members of this production.":"مواعيد العروض ظاهرة لجميع مستخدمي منارة. تأكيد الحضور متاح لأعضاء هذا الإنتاج.","Director":"مخرج","Edit production and scenes":"تعديل الإنتاج والمشاهد","Add rehearsal":"أضف بروفة","No one else is in this production yet.":"لا يوجد أحد غيرك في هذا الإنتاج بعد.","Nothing scheduled for this day.":"لا توجد مواعيد لهذا اليوم.","Select a department":"اختر القسم","Department":"القسم","Sound":"صوت","Lighting":"إضاءة","Delete cue":"حذف الإشارة","Duplicate":"نسخ","Save cue":"حفظ الإشارة","Scene script":"نص المشهد","Paste or type the script for this scene":"الصق أو اكتب نص هذا المشهد","Save script":"حفظ النص","Edit script":"تعديل النص","Add script":"أضف النص","Roles in":"الأدوار في","No one else is in this production yet.":"لا يوجد أحد غيرك في هذا الإنتاج بعد.","The code needs at least 6 characters.":"يجب أن يتكون الرمز من 6 أحرف على الأقل.","Enter a name and a username (letters and numbers).":"أدخل الاسم واسم المستخدم (حروف وأرقام).","The production needs a name.":"يجب إدخال اسم للإنتاج.","Name at least one scene.":"أدخل اسمًا لمشهد واحد على الأقل.","Keep at least one named scene.":"يجب الإبقاء على مشهد واحد مسمّى على الأقل.","Create the first one.":"أنشئ أول إنتاج.","You are not in any production yet. Ask your director or admin to add you.":"لست ضمن أي إنتاج بعد. اطلب من المخرج أو المشرف إضافتك.","This production has no scenes yet.":"لا توجد مشاهد في هذا الإنتاج بعد.","Someone":"شخص","Switch to light mode":"التبديل إلى الوضع الفاتح","Switch to dark mode":"التبديل إلى الوضع الداكن","Your profile":"ملفك الشخصي","Choose a production":"اختر إنتاجًا","Scenes":"المشاهد","Sun":"الأحد","Mon":"الاثنين","Tue":"الثلاثاء","Wed":"الأربعاء","Thu":"الخميس","Fri":"الجمعة","Sat":"السبت"});
AR_TEXT["Account codes are managed by admins. Contact an admin if you need help signing in."]="يتولى المشرفون إدارة رموز الدخول. تواصل مع أحدهم إذا احتجت إلى مساعدة في تسجيل الدخول.";
AR_TEXT["Go to calendar"]="اذهب إلى التقويم";

/* ===== logo ===== */
function logo(size){
  return '<svg class="logo" width="'+size+'" height="'+size+'" viewBox="0 0 48 48" role="img" aria-label="Manara lighthouse logo">'
   +'<path d="M1.5 5.5L17.5 11v3L1.5 18.5z" fill="var(--light)" opacity=".55"/><path d="M46.5 5.5L30.5 11v3l16 4.5z" fill="var(--light)" opacity=".55"/>'
   +'<path d="M19 9.5L24 4l5 5.5z" fill="currentColor"/><rect x="20" y="9.5" width="8" height="6.5" rx="1" fill="var(--light)"/>'
   +'<rect x="17.5" y="16" width="13" height="2.2" rx=".8" fill="currentColor"/><path d="M20 18.2h8l3 23.8H17z" fill="currentColor"/>'
   +'<path d="M19.25 24h9.5l.5 4h-10.5z M18.1 33h11.8l.5 4h-12.8z" fill="var(--light)"/><rect x="13.5" y="42" width="21" height="3.2" rx="1" fill="currentColor"/></svg>';
}
var IC = {
  home:'<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  cal:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  script:'<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 16h6"/>',
  cues:'<path d="M4 8h10M18 8h2M4 16h2M10 16h10"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/>',
  team:'<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c3 .2 5 2.3 5 5.3"/>',
  up:'<path d="M6 15l6-6 6 6"/>', down:'<path d="M6 9l6 6 6-6"/>', chev:'<path d="M6 9l6 6 6-6"/>', x:'<path d="M6 6l12 12M18 6L6 18"/>', plus:'<path d="M12 5v14M5 12h14"/>',
  check:'<path d="M5 12l5 5 9-10"/>'
};
function ic(n,sz){ sz=sz||22; return '<svg width="'+sz+'" height="'+sz+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+IC[n]+'</svg>'; }

/* ===== render ===== */
function render(){
  applyTheme();
  var app=document.getElementById("app"), y=window.scrollY;
  var h;
  if(S.fatal) h = renderFatal();
  else if(!S.ready) h = '<div class="auth">'+logo(120)+'<p class="muted">Loading…</p></div>';
  else if(!S.user) h = S.needsSetup ? renderSetup() : renderLogin();
  else h = S.live ? renderLive() : renderShell();
  h += renderSheet();
  if(S.toast) h += '<div class="toast" role="status">'+esc(S.toast)+'</div>';
  app.innerHTML = h;
  applyLanguage();
  if(!S.live) window.scrollTo(0,y);
}
function softRender(){ if(S.sheet) S.dirty=true; else render(); }
function renderFatal(){
  return '<div class="auth">'+logo(120)+'<div class="box"><h2 class="h1">Cannot start</h2><p class="err">'+esc(S.fatal)+'</p><button class="btn primary block" data-act="reload">Try again</button></div></div>';
}
function authHead(sub){
  return logo(150)+'<div class="lockup"><b>Manara</b><span>'+esc(sub)+'</span></div>';
}
function renderLogin(){
  return '<div class="auth">'+authHead("Drama Team")
   +'<form data-form="login" autocomplete="on"><div class="field"><label for="f_username">Username</label><input id="f_username" data-f="username" value="'+esc(S.form.username||"")+'" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="next" autocomplete="username"></div>'
   +'<div class="field"><label for="f_code">Code</label><input id="f_code" data-f="code" type="password" value="'+esc(S.form.code||"")+'" enterkeyhint="go" autocomplete="current-password"></div>'
   +(S.authErr?'<p class="err">'+esc(S.authErr)+'</p>':'')
   +'<button type="button" class="btn primary block" data-act="login"'+(S.busy?' disabled':'')+'>'+(S.busy?'Signing in…':'Sign in')+'</button>'
   +'<p class="hint">Your username and code come from your team admin.'+(DB&&DB.mode==="demo"?' <b>Demo mode:</b> data stays on this phone only.':'')+'</p></form></div>';
}
function renderSetup(){
  return '<div class="auth">'+authHead("First-time setup")
   +'<form data-form="setup"><p class="hint">Create the admin account. You will use it to add everyone else.</p>'
   +'<div class="field"><label for="f_name">Your name</label><input id="f_name" data-f="name" value="'+esc(S.form.name||"")+'" enterkeyhint="next" autocomplete="name"></div>'
   +'<div class="field"><label for="f_username">Username</label><input id="f_username" data-f="username" value="'+esc(S.form.username||"")+'" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="next"></div>'
   +'<div class="field"><label for="f_code">Code (at least 6 characters)</label><input id="f_code" data-f="code" type="password" value="'+esc(S.form.code||"")+'" enterkeyhint="go" autocomplete="new-password"></div>'
   +(S.authErr?'<p class="err">'+esc(S.authErr)+'</p>':'')
   +'<button type="button" class="btn primary block" data-act="setup"'+(S.busy?' disabled':'')+'>Create admin</button></form></div>';
}

function renderShell(){
  var p=prod(), h='';
  var order=["home","calendar","production","team"], prior=order.indexOf(S.lastTab), now=order.indexOf(S.tab);
  var animate=!!(S.lastTab&&S.lastTab!==S.tab), from=prior<now?"18px":"-18px";
  h += '<header class="top">'+logo(40)
    +'<div class="top-production"><small>Current production</small><b>'+esc(p?p.name:"No production selected")+'</b></div>'
    +'<button class="theme-toggle" data-act="theme-toggle" aria-label="Switch to '+(effectiveTheme()==="dark"?'light':'dark')+' mode">'+(effectiveTheme()==="dark"?'☼ Light':'◐ Dark')+'</button>'
    +'<button class="language-toggle" data-act="language-toggle" aria-label="Switch language">'+(S.lang==="ar"?'English':'عربي')+'</button>'
    +'<button class="avatar" data-act="tab" data-t="team" aria-label="Your profile">'+esc(initials(S.user.name))+'</button></header>';
  h+='<div class="production-selector-bar"><div class="production-sidebar-title">Productions</div><nav class="production-list" aria-label="Choose a production">';
  if(S.prods.length) S.prods.forEach(function(x){ h+='<button class="production-choice" data-act="switch-prod" data-id="'+esc(x.id)+'" aria-current="'+(x.id===S.pid)+'"><span class="production-indicator" aria-hidden="true"></span><span class="production-choice-name">'+esc(x.name)+'</span></button>'; });
  else h+='<p class="muted small sidebar-empty">No productions yet.</p>';
  h+='</nav>'+(isAdmin()?'<button class="sidebar-new-production" data-act="new-prod">'+ic("plus",18)+' New production</button>':'')+'</div><div class="workspace-layout"><div class="workspace-main">';
  h += '<main class="page'+(animate?' page-slide':'')+'" style="--slide-from:'+from+'" data-active-tab="'+S.tab+'">';
  if(S.tab==="calendar") h += renderCalendar(p);
  else if(!p) h += renderNoProd();
  else if(S.tab==="home") h += renderHome(p);
  else if(S.tab==="production") h += renderProduction(p);
  else h += renderTeam(p);
  h += '</main>';
  if(p && S.tab==="production" && S.prodView==="cues" && myDepts().length) h += '<button class="fab" data-act="add-cue">'+ic("plus",20)+' Add cue</button>';
  if(p && S.tab==="production" && S.prodView==="notes") h += '<button class="fab" data-act="add-note">'+ic("plus",20)+' Add note</button>';
  h += '<nav class="tabs" aria-label="Main">'
    + tab("home","Home","home")+tab("calendar","Calendar","cal")+tab("production","Production","script")+tab("team","Team","team")+'</nav>';
  h+='</div></div>';
  S.lastTab=null;
  return h;
}
function tab(id,label,icon){ return '<button class="tab" data-act="tab" data-t="'+id+'" aria-current="'+(S.tab===id)+'">'+ic(icon,22)+'<span>'+label+'</span></button>'; }
function renderNoProd(){
  return '<h1 class="h1">Welcome, '+esc(S.user.name.split(" ")[0])+'</h1>'
   +(isAdmin()?'<div class="empty">No productions yet. Create the first one.</div><button class="btn primary block" data-act="new-prod">'+ic("plus",20)+' New production</button>'
              :'<div class="empty">You are not in any production yet. Ask your director or admin to add you.</div>');
}
function daysUntil(ms){ var a=new Date(), b=new Date(ms); a.setHours(0,0,0,0); b.setHours(0,0,0,0); return Math.ceil((b-a)/86400000); }
function relativeDate(ms){var n=daysUntil(ms);if(S.lang==="ar")return n<0?"مضى":n===0?"اليوم":n===1?"غدًا":"بعد "+n+" يومًا";return n<0?"Past":n===0?"Today":n===1?"Tomorrow":"In "+n+" days";}
function productionCountText(p){return S.lang==="ar"?p.scenes.length+" مشاهد · "+(p.memberIds||[]).length+" أعضاء":p.scenes.length+(p.scenes.length===1?" scene":" scenes")+" · "+(p.memberIds||[]).length+" people";}
function dateLabel(ms){ return new Date(ms).toLocaleString(S.lang==="ar"?"ar-EG":undefined,{weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}); }
function dateInputValue(ms){ var d=new Date(ms); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function timeInputValue(ms){ var d=new Date(ms); return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); }
function dayKey(ms){ return dateInputValue(ms); }
function dateFromKey(key){ var a=String(key||"").split("-").map(Number); return new Date(a[0],a[1]-1,a[2]); }
function calendarTitle(d){ return d.toLocaleDateString(S.lang==="ar"?"ar-EG":undefined,{month:"long",year:"numeric"}); }
function allVisibleEvents(){
  var all={}, rows=(S.publicShows||[]).concat(S.events||[]);
  rows.forEach(function(e){var key=(e.pid||S.pid||"")+":"+e.id;all[key]=e;});
  return Object.keys(all).map(function(k){return all[k];});
}
function eventsOn(key){ return allVisibleEvents().filter(function(e){ return dayKey(e.startsAt)===key; }).sort(function(a,b){return a.startsAt-b.startsAt;}); }
function nextEvent(pid){ return allVisibleEvents().filter(function(e){ return (!pid||(e.pid||S.pid)===pid)&&e.startsAt>=Date.now(); }).sort(function(a,b){ return a.startsAt-b.startsAt; })[0]||null; }
function renderHome(p){
  var r=myRoles(), mine=S.notes.filter(function(n){ return n.to===S.user.uid; }).sort(function(a,b){ return b.at-a.at; }).slice(0,3), upcoming=allVisibleEvents().filter(function(e){ return e.startsAt>=Date.now(); }).sort(function(a,b){ return a.startsAt-b.startsAt; });
  var next=upcoming[0];
  var h='<h1 class="h1">'+(S.lang==="ar"?'مرحبًا، ':'Hi, ')+esc(S.user.name.split(" ")[0])+'</h1>';
  h+='<div class="card"><div class="row"><h3 class="grow">'+esc(p.name)+'</h3><span class="badge">'+esc(r.length?roleLabel(r):(isAdmin()?"Admin":"Member"))+'</span></div>'
    +'<p class="muted small">'+productionCountText(p)+'</p></div>';
  h+='<div class="card home-coming"><div class="row"><h3 class="grow">Coming up</h3><button class="small muted home-calendar-link" data-act="tab" data-t="calendar">Go to calendar <span aria-hidden="true">→</span></button></div>';
  if(next){
    var scope=next.pid&&next.pid!==S.pid?(next.productionName||"Another production")+' · ':'';
    h+='<div class="home-coming-feature"><div class="row"><span class="event-kind '+(next.kind==="show"?'show':'rehearsal')+'"><i></i>'+(next.kind==="show"?'Production / show':'Rehearsal')+'</span><span class="home-coming-until">'+esc(relativeDate(next.startsAt))+'</span></div>'
      +'<b class="home-coming-title">'+esc(next.title)+'</b><p class="muted small">'+esc(scope+dateLabel(next.startsAt))+'</p></div>';
    upcoming.slice(1,3).forEach(function(e){
      var otherScope=e.pid&&e.pid!==S.pid?(e.productionName||"Another production")+' · ':'';
      h+='<div class="home-coming-row"><span class="home-coming-date"><b>'+esc(new Date(e.startsAt).toLocaleDateString(S.lang==="ar"?"ar-EG":undefined,{day:"numeric"}))+'</b><small>'+esc(new Date(e.startsAt).toLocaleDateString(S.lang==="ar"?"ar-EG":undefined,{month:"short"}))+'</small></span><span class="home-coming-copy"><b>'+esc(e.title)+'</b><small>'+esc(otherScope+dateLabel(e.startsAt))+'</small></span><span class="event-kind '+(e.kind==="show"?'show':'rehearsal')+'"><i></i>'+(e.kind==="show"?'Production / show':'Rehearsal')+'</span></div>';
    });
  }
  else h+='<p class="muted">No upcoming dates yet.</p>';
  h+='</div>';
  h+='<div class="card"><h3>Notes for you</h3>';
  if(!mine.length) h+='<p class="muted">Nothing from the director yet.</p>';
  mine.forEach(function(n){ h+=noteHtml(n,false); });
  if(mine.length) h+='<button class="btn block" data-act="go-notes">See all notes</button>';
  h+='</div>';
  return h;
}

/* --- production workspace --- */
function sceneChips(p){
  var s=scene(), h='<nav class="chips" aria-label="Scenes">';
  p.scenes.forEach(function(sc,i){ h+='<button class="chip" data-act="scene" data-id="'+sc.id+'"'+(s&&sc.id===s.id?' aria-current="true"':'')+'><span class="n">'+(i+1)+'</span><span class="t">'+esc(sc.name)+'</span></button>'; });
  return h+'</nav>';
}
function renderProduction(p){
  var views=[["overview","Overview"],["script","Script"],["cues","Cues"],["notes","Notes"]];
  var h='<h1 class="h1">'+esc(p.name)+'</h1><div class="seg workspace-tabs" role="tablist" aria-label="Production pages">';
  views.forEach(function(v){ h+='<button role="tab" data-act="prod-view" data-v="'+v[0]+'" aria-selected="'+(S.prodView===v[0])+'">'+v[1]+'</button>'; });
  h+='</div>';
  var order=["overview","script","cues","notes"], changed=!!(S.lastProdView&&S.lastProdView!==S.prodView);
  var from=order.indexOf(S.prodView)>=order.indexOf(S.lastProdView)?"16px":"-16px", content="";
  if(S.prodView==="overview") content=renderProductionOverview(p);
  else if(S.prodView==="script") content=sceneChips(p)+renderScript(p);
  else if(S.prodView==="cues") content=sceneChips(p)+(canRunLiveMode()?'<button class="btn primary block" data-act="open-live">Open Live mode</button>':'')+renderCues(p);
  else content=sceneChips(p)+renderNotes(p,scene());
  S.lastProdView=null;
  return h+'<div class="prod-tab-content'+(changed?' prod-tab-slide':'')+'" style="--slide-from:'+from+'">'+content+'</div>';
}
function renderProductionOverview(p){
  var upcoming=nextEvent(p.id), mine=S.notes.filter(function(n){ return n.to===S.user.uid; }).length;
  var character=(p.characters||{})[S.user.uid];
  var h='<div class="card"><div class="row"><h3 class="grow">Your part</h3><span class="badge">'+esc(roleLabel(myRoles())||(isAdmin()?"Admin":"Member"))+'</span></div>'+(character?'<p class="character-part"><b>Playing:</b> '+esc(character)+'</p>':'')+'<p class="muted small">'+productionCountText(p)+'</p></div>';
  h+='<div class="card"><h3>Next date</h3>'+(upcoming?'<b>'+esc(upcoming.title)+'</b><p class="muted small">'+esc(dateLabel(upcoming.startsAt))+' · '+relativeDate(upcoming.startsAt)+'</p>':'<p class="muted">Nothing scheduled yet.</p>')+'<button class="btn" data-act="tab" data-t="calendar">Open calendar</button></div>';
  h+='<div class="card"><h3>Production materials</h3><p class="muted">Read the script, your role cues, and rehearsal notes in one place.</p><div class="sheetrow"><button class="btn" data-act="prod-view" data-v="script">Script</button><button class="btn" data-act="prod-view" data-v="cues">Cues</button></div><button class="btn" data-act="prod-view" data-v="notes">'+mine+' note'+(mine===1?'':'s')+' for you</button></div>';
  if(isDirector()) h+='<button class="btn block" data-act="edit-prod">Edit production and scenes</button>';
  return h;
}
function renderScript(p){
  var s=scene(), doc=s&&S.scripts.filter(function(x){ return x.id===s.id; })[0], h='<h2 class="section-title">Script</h2>';
  if(!s) return h+'<div class="empty">Add a scene to start the script.</div>';
  h+='<div class="card script-card"><div class="row"><b class="grow">'+esc(s.name)+'</b>'+(canEditScript()?'<button class="btn" data-act="edit-script" data-id="'+s.id+'">'+(doc?'Edit':'Add text')+'</button>':'')+'</div>';
  h+=doc&&doc.text?'<div class="highlight-tools"><span class="hint">Select text, then choose a color. Only you can see your highlights.</span><div class="highlight-colors">'+[['yellow','Yellow'],['green','Green'],['pink','Pink'],['blue','Blue']].map(function(x){return '<button class="highlight-color '+x[0]+'" data-act="script-highlight" data-color="'+x[0]+'" aria-label="Highlight selected text '+x[1].toLowerCase()+'">'+x[1]+'</button>';}).join('')+(S.highlights.length?'<button class="highlight-clear" data-act="clear-highlights">Clear mine</button>':'')+'</div></div><pre id="script-body" class="script-text">'+renderHighlightedScript(doc.text,S.highlights)+'</pre>':'<p class="muted">The director has not added this scene’s script yet.</p>';
  if(doc&&doc.updatedAt) h+='<p class="hint">Updated '+esc(dateLabel(doc.updatedAt))+'</p>';
  return h+'</div>';
}
function renderHighlightedScript(text,highlights){
  var allowed={yellow:1,green:1,pink:1,blue:1}, valid=(highlights||[]).filter(function(x){return x&&Number.isInteger(x.start)&&Number.isInteger(x.end)&&x.start>=0&&x.end>x.start&&x.end<=text.length&&allowed[x.color]&&(!x.quote||x.quote===text.slice(x.start,x.end));}).sort(function(a,b){return a.start-b.start||a.end-b.end;}), out="", pos=0;
  valid.forEach(function(x){if(x.start<pos)return;out+=esc(text.slice(pos,x.start))+'<mark class="script-highlight '+x.color+'">'+esc(text.slice(x.start,x.end))+'</mark>';pos=x.end;});
  return out+esc(text.slice(pos));
}
function selectedScriptRange(){
  var body=document.getElementById("script-body"), selection=window.getSelection();
  if(!body||!selection||selection.isCollapsed||!body.contains(selection.anchorNode)||!body.contains(selection.focusNode)) return null;
  var range=selection.getRangeAt(0), before=document.createRange(), through=document.createRange();
  before.selectNodeContents(body); before.setEnd(range.startContainer,range.startOffset);
  through.selectNodeContents(body); through.setEnd(range.endContainer,range.endOffset);
  return {start:before.toString().length,end:through.toString().length};
}
function renderCalendar(p){
  var now=new Date(), today=dayKey(now.getTime());
  if(!S.calMonth) S.calMonth=new Date(now.getFullYear(),now.getMonth(),1);
  if(!S.calSelected) S.calSelected=today;
  var m=S.calMonth, first=new Date(m.getFullYear(),m.getMonth(),1), weekStart=S.lang==="ar"?6:0, offset=(first.getDay()-weekStart+7)%7, total=new Date(m.getFullYear(),m.getMonth()+1,0).getDate(), cells=Math.ceil((offset+total)/7)*7;
  var all=allVisibleEvents().sort(function(a,b){return a.startsAt-b.startsAt;}), h='<div class="row"><h1 class="h1 grow">Calendar</h1>'+(p&&isDirector()?'<button class="btn primary" data-act="new-event">'+ic("plus",18)+' Add date</button>':'')+'</div>';
  h+='<div class="cal-legend"><span><i class="rehearsal"></i> Rehearsal</span><span><i class="show"></i> Production / show</span></div>';
  h+='<div class="seg cal-mode" role="group" aria-label="Calendar view"><button data-act="cal-mode" data-v="month" aria-pressed="'+(S.calMode==="month")+'">Month</button><button data-act="cal-mode" data-v="agenda" aria-pressed="'+(S.calMode==="agenda")+'">Agenda</button></div>';
  if(S.calMode==="month"){
    h+='<section class="card month-card" aria-label="'+esc(calendarTitle(m))+'"><div class="month-head"><button class="month-arrow" data-act="cal-nav" data-d="-1" aria-label="Previous month">‹</button><h2>'+esc(calendarTitle(m))+'</h2><button class="month-arrow" data-act="cal-nav" data-d="1" aria-label="Next month">›</button></div>';
    h+='<div class="month-weekdays" aria-hidden="true">'+(S.lang==="ar"?["السبت","الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة"]:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]).map(function(x){return '<span>'+x+'</span>';}).join('')+'</div><div class="month-grid">';
    for(var i=0;i<cells;i++){
      var day=i-offset+1, inMonth=day>0&&day<=total, cellDate=new Date(m.getFullYear(),m.getMonth(),day), key=dayKey(cellDate.getTime()), dayEvents=inMonth?eventsOn(key):[], labels=dayEvents.map(function(e){return (e.kind==="show"?"Production/show":"Rehearsal")+": "+e.title;}).join(", ");
      h+='<button class="cal-day'+(inMonth?'':' outside')+(key===S.calSelected?' selected':'')+(key===today?' today':'')+'" data-act="cal-day" data-date="'+key+'"'+(inMonth?'':' disabled')+' aria-label="'+esc(inMonth?cellDate.toLocaleDateString(S.lang==="ar"?"ar-EG":undefined,{weekday:"long",month:"long",day:"numeric"})+(labels?"; "+labels:"; no dates"):"")+'" aria-pressed="'+(key===S.calSelected)+'">'
        +'<span class="cal-num">'+(inMonth?day:'')+'</span>'+(dayEvents.length?'<span class="cal-dots">'+dayEvents.slice(0,3).map(function(e){return '<i class="'+(e.kind==="show"?'show':'rehearsal')+'"></i>';}).join('')+(dayEvents.length>3?'<b>+'+(dayEvents.length-3)+'</b>':'')+'</span>':'<span class="cal-dots blank"></span>')+'</button>';
    }
    h+='</div><div class="month-foot"><span>'+esc(calendarTitle(m))+'</span><button class="small muted" data-act="cal-today">Today</button></div></section>';
    var selected=dateFromKey(S.calSelected), selectedEvents=eventsOn(S.calSelected);
    h+='<div class="row day-heading"><h2 class="grow">'+esc(selected.toLocaleDateString(S.lang==="ar"?"ar-EG":undefined,{weekday:"long",month:"long",day:"numeric"}))+'</h2><span class="muted small">'+selectedEvents.length+' date'+(selectedEvents.length===1?'':'s')+'</span></div>';
    if(!selectedEvents.length) h+='<div class="empty">'+(all.length?'Nothing scheduled for this day.':'No dates yet. A director can add rehearsals and production dates.')+'</div>';
    selectedEvents.forEach(function(e){h+=renderCalendarEvent(e);});
  }else{
    if(!all.length) h+='<div class="empty">No rehearsals or production dates yet. A director can add the first date.</div>';
    all.forEach(function(e){h+=renderCalendarEvent(e);});
  }
  return h;
}
function renderCalendarEvent(e){
  var rs=S.responses[e.id]||[], yes=rs.filter(function(r){return r.response==="going";}).length, no=rs.filter(function(r){return r.response==="not-going";}).length;
  var mine=rs.filter(function(r){return r.uid===S.user.uid;})[0], invite=(e.memberIds||[]).indexOf(S.user.uid)>-1, days=daysUntil(e.startsAt), show=e.kind==="show";
  var eventProd=S.prods.filter(function(x){return x.id===e.pid;})[0], canManage=isDirector()&&(!e.pid||e.pid===S.pid), canRespond=invite&&!!eventProd;
  var context=e.productionName||(eventProd&&eventProd.name), otherProd=e.pid&&e.pid!==S.pid;
  var h='<article class="card event-card '+(show?'event-show':'event-rehearsal')+'"><div class="row"><span class="event-kind '+(show?'show':'rehearsal')+'"><i></i>'+(show?'Production / show':'Rehearsal')+'</span><span class="grow"></span>'+(canManage?'<button class="small muted" data-act="edit-event" data-id="'+e.id+'">Edit</button><button class="small muted" data-act="del-event" data-id="'+e.id+'">'+(S.confirmEventDelete===e.id?'Tap again to delete':'Delete')+'</button>':'')+'</div>';
  h+='<h3>'+esc(e.title)+'</h3><p class="muted small">'+esc(dateLabel(e.startsAt))+(otherProd&&context?' · '+esc(context):'')+'</p><b class="countdown">'+(S.lang==="ar"?(days<0?'مضى':days===0?'اليوم':days===1?'غدًا':'بعد '+days+' يومًا'):(days<0?'Past':days===0?'Today':days===1?'Tomorrow':days+' days away'))+'</b>';
  if(canRespond||isAdmin()) h+='<p class="muted small">'+yes+' going · '+no+' can’t make it</p>';
  if(canRespond) h+='<div class="rsvp"><button class="btn'+(mine&&mine.response==="going"?' primary':'')+'" data-act="rsvp" data-id="'+e.id+'" data-r="going" aria-pressed="'+(mine&&mine.response==="going")+'">I’m going</button><button class="btn'+(mine&&mine.response==="not-going"?' primary':'')+'" data-act="rsvp" data-id="'+e.id+'" data-r="not-going" aria-pressed="'+(mine&&mine.response==="not-going")+'">Can’t make it</button></div>';
  else if(show) h+='<p class="hint">Visible to all Manara users. RSVPs are for members of this production.</p>';
  else h+='<p class="hint">This rehearsal is for selected members of this production.</p>';
  return h+'</article>';
}

/* --- role-specific cues --- */
function renderCues(p){
  var h='', s=scene(), depts=myDepts();
  if(!depts.length) return '<div class="empty">Technical cues are for Sound and Lighting. Your script and rehearsal notes are in the other production pages.</div>';
  var dep=isDirector()?S.dept:(depts.length===1?depts[0]:"all");
  if(isDirector()||depts.length>1) h+='<div class="seg" role="group" aria-label="Department">'+[["all","All"],["sound","Sound"],["lighting","Lighting"]].map(function(x){ return '<button data-act="dept" data-d="'+x[0]+'" aria-pressed="'+(dep===x[0])+'">'+x[1]+'</button>'; }).join('')+'</div>';
  var list=S.cues.filter(function(c){ return c.sceneId===(s&&s.id) && (dep==="all"||c.dept===dep); }).sort(function(a,b){ return ((a.dept==='sound'?0:1)-(b.dept==='sound'?0:1)) || (a.order||0)-(b.order||0); });
  if(!list.length) h+='<div class="empty">No cues in this scene yet.'+(myDepts().length?' Tap “Add cue”.':'')+'</div>';
  else{
    h+='<ul class="cues">';
    list.forEach(function(c,i){
      var a=actionOf(c.dept,c.action), ac=(c.dept==="lighting"&&c.color)?c.color:a.color, can=canEditDept(c.dept);
      var same=list.filter(function(x){ return x.dept===c.dept; }), si=same.indexOf(c);
      h+='<li class="cue" style="--ac:'+ac+'"><button class="cue-main" data-act="edit-cue" data-id="'+c.id+'"'+(can?'':' disabled')+'><span class="q">'+numberOf(c)+'</span><span class="cbody">'
        +'<span class="row1"><span class="pill">'+esc(a.label)+'</span>'+(c.dept==="lighting"&&c.color?'<span class="dot" style="background:'+esc(c.color)+'"></span>':'')+'<span class="track">'+esc(c.label||(c.dept==="lighting"?"Lights":"No track named"))+'</span></span>'
        +(c.trigger?'<span class="small">On: '+esc(c.trigger)+'</span>':'')
        +(c.len?'<span class="small muted">'+(c.dept==="lighting"?((c.action==="lfadein"||c.action==="lfadeout")?"Fade "+c.len+" sec":"Duration "+c.len+" sec"):"Length "+fmt(c.len))+'</span>':'')
        +(c.note?'<span class="small muted">'+esc(c.note)+'</span>':'')+'</span></button>'
        +(can?'<div class="mv"><button data-act="up" data-id="'+c.id+'" aria-label="Move up"'+(si===0?' disabled':'')+'>'+ic("up")+'</button><button data-act="down" data-id="'+c.id+'" aria-label="Move down"'+(si===same.length-1?' disabled':'')+'>'+ic("down")+'</button></div>':'')
        +'</li>';
    });
    h+='</ul>';
  }
  return h;
}
function noteHtml(n,withDelete){
  var mine=n.author===S.user.uid, direct=!!n.to;
  var who = direct ? (mine ? "To "+nameOf(n.to) : "From "+nameOf(n.author)) : "Private to you";
  return '<div class="note'+(direct?' direct':'')+'"><span class="who">'+esc(who)+(n.sceneName?' · '+esc(n.sceneName):'')+'</span><span class="txt">'+esc(n.text)+'</span>'
    +(withDelete&&mine?'<button class="small muted" data-act="del-note" data-id="'+n.id+'" style="min-height:36px;text-align:left">Delete</button>':'')+'</div>';
}
function renderNotes(p,s){
  var list=S.notes.filter(function(n){ return n.sceneId===(s&&s.id); }).sort(function(a,b){ return b.at-a.at; });
  var h='<p class="hint">Notes for this scene. Private notes are only visible to you. '+(isDirector()?'Notes you send to a person are visible to them and to you.':'Notes from the director appear here.')+'</p>';
  if(!list.length) h+='<div class="empty">No notes for this scene yet.</div>';
  list.forEach(function(n){ h+=noteHtml(n,true); });
  return h;
}

/* --- team tab --- */
function renderTeam(p){
  var h='<h1 class="h1">Team</h1>';
  h+='<div class="card"><div class="row"><div class="avatar">'+esc(initials(S.user.name))+'</div><div class="grow"><b>'+esc(S.user.name)+'</b><p class="muted small">@'+esc(S.user.username)+(isAdmin()?' · Admin':'')+'</p></div></div>'
    +'<p class="hint">Account codes are managed by admins. Contact an admin if you need help signing in.</p>'
    +'<div class="sheetrow"><button class="btn" data-act="logout">Sign out</button></div></div>';
  if(p){
    h+='<div class="row"><h3 class="grow" style="font-family:var(--display);font-size:24px">In '+esc(p.name)+'</h3>'+(isDirector()?'<button class="btn" data-act="add-member">'+ic("plus",18)+' Add</button>':'')+'</div>';
    var ids=Object.keys(p.members||{});
    if(!ids.length) h+='<div class="empty">Nobody added yet.</div>';
    ids.sort(function(a,b){ return nameOf(a).localeCompare(nameOf(b)); }).forEach(function(id){
      var role=p.members[id];
      var part=(p.characters||{})[id];
      h+='<button class="li" data-act="member" data-id="'+id+'"'+(isDirector()?'':' disabled')+'><span class="grow"><b>'+esc(nameOf(id))+'</b><br><small>@'+esc((userById(id)||{}).username||"")+(part?'<br><span class="character-part">Playing: '+esc(part)+'</span>':'')+'</small></span><span class="badge">'+esc(roleLabel(role))+'</span></button>';
    });
    if(isDirector()) h+='<button class="btn block" data-act="edit-prod">Rename production or edit scenes</button>';
  }
  if(isAdmin()){
    h+='<div class="row" style="margin-top:8px"><h3 class="grow" style="font-family:var(--display);font-size:24px">Everyone with an account</h3><button class="btn" data-act="new-user">'+ic("plus",18)+' New person</button></div>';
    S.users.slice().sort(function(a,b){ return a.name.localeCompare(b.name); }).forEach(function(u){
      h+='<div class="li"><span class="grow"><b>'+esc(u.name)+'</b><br><small>@'+esc(u.username)+'</small></span>'+(u.isAdmin?'<span class="badge">Admin</span>':'')+'</div>';
    });
    h+='<button class="btn block" data-act="new-prod">'+ic("plus",18)+' New production</button>';
  }
  return h;
}

/* --- live mode --- */
function liveList(){ return sortedCues(S.live.dept); }
function renderLive(){
  var L=S.live, f=liveList(), idx=L.idx, cur=(idx>=0&&idx<f.length)?f[idx]:null, nxt=(idx+1<f.length)?f[idx+1]:null;
  var pct=f.length?Math.round(((idx+1)/f.length)*100):0;
  var sc=cur?(prod().scenes[sceneIndex(cur.sceneId)]||{name:""}).name:(idx>=f.length&&f.length?"End of show":"Standing by");
  var depts=myDepts();
  var h='<div class="live" role="region" aria-label="Live cue view"><div class="ltop"><button class="xbtn" data-act="exit-live" aria-label="Leave live mode">'+ic("x")+'</button>'
    +'<div class="lscene"><b>'+esc(sc)+'</b><span>'+(depts.length>1?'<button data-act="live-dept" style="text-decoration:underline;min-height:24px">'+(L.dept==="sound"?"Sound":"Lighting")+' · tap to switch</button>':(L.dept==="sound"?"Sound":"Lighting"))+(f.length?' · '+Math.max(0,Math.min(idx+1,f.length))+' of '+f.length:'')+'</span></div></div>'
    +'<div class="progress"><i style="width:'+pct+'%"></i></div>';
  if(cur){
    var a=actionOf(cur.dept,cur.action), ac=(cur.dept==="lighting"&&cur.color)?cur.color:a.color;
    h+='<div class="now" style="--ac:'+ac+'"><div class="lq">'+numberOf(cur)+'</div><div class="lact">'+esc(a.label)+'</div><div class="ltrack">'+esc(cur.label||(cur.dept==="lighting"?"Lights":"No track named"))+'</div>'
      +(cur.dept==="lighting"&&cur.color?'<div class="lswatch" style="background:'+esc(cur.color)+'"></div>':'')
      +(cur.trigger?'<div class="ltrig">On: '+esc(cur.trigger)+'</div>':'')+(cur.note?'<div class="lnote">'+esc(cur.note)+'</div>':'')+'</div>';
  }else h+='<div class="now"><div class="standby">'+logo(64)+'<b>'+(idx>=f.length&&f.length?"That is the end":(f.length?"Standing by":"No cues yet"))+'</b>'+(f.length?(idx>=f.length?'Tap Back to return to the last cue.':'Tap Go to start with '+numberOf(f[0])+'.'):'Add cues first.')+'</div></div>';
  if(nxt){ var na=actionOf(nxt.dept,nxt.action); h+='<div class="next" style="--ac:'+((nxt.dept==="lighting"&&nxt.color)?nxt.color:na.color)+'"><small>Next</small><div>'+numberOf(nxt)+' · '+esc(na.label)+(nxt.label?' · '+esc(nxt.label):'')+'</div></div>'; }
  else h+='<div class="next"><small>Next</small><div>Nothing after this</div></div>';
  h+='<div class="lbar"><button class="btn" data-act="back"'+(idx>=0?'':' disabled')+'>Back</button><button class="btn" data-act="live-note"'+(cur?'':' disabled')+'>Note</button><button class="btn go" data-act="go"'+(f.length&&idx<f.length?'':' disabled')+'>Go</button></div></div>';
  return h;
}

/* --- sheets --- */
function field(k,label,val,ph,opts){
  opts=opts||{};
  return '<div class="field"><label for="f_'+k+'">'+label+'</label><input id="f_'+k+'" data-f="'+k+'" type="'+(opts.type||"text")+'" value="'+esc(val)+'" placeholder="'+esc(ph||"")+'" enterkeyhint="'+(opts.last?"done":"next")+'" autocomplete="off"'+(opts.nocap?' autocapitalize="none" autocorrect="off" spellcheck="false"':'')+'></div>';
}
function area(k,label,val,ph,rows){ return '<div class="field"><label for="f_'+k+'">'+label+'</label><textarea id="f_'+k+'" data-f="'+k+'" placeholder="'+esc(ph||"")+'" enterkeyhint="enter" rows="'+(rows||3)+'">'+esc(val)+'</textarea></div>'; }
function rowBtns(cancel,okAct,okLabel){ return '<div class="sheetrow stick"><button class="btn" data-act="close">'+cancel+'</button><button class="btn primary" data-act="'+okAct+'">'+okLabel+'</button></div>'; }
function renderSceneRows(rows){
  var h='<div class="scene-editor" role="group" aria-label="Scene names">';
  rows.forEach(function(sc,i){ h+='<div class="scene-row"><span class="scene-number">'+(i+1)+'</span><input data-scene="'+i+'" value="'+esc(sc.name)+'" placeholder="Scene name" enterkeyhint="next" autocomplete="off" aria-label="Scene '+(i+1)+' name"><div class="scene-controls"><button type="button" data-act="scene-up" data-i="'+i+'" aria-label="Move scene up"'+(i===0?' disabled':'')+'>'+ic("up",18)+'</button><button type="button" data-act="scene-down" data-i="'+i+'" aria-label="Move scene down"'+(i===rows.length-1?' disabled':'')+'>'+ic("down",18)+'</button><button type="button" data-act="scene-remove" data-i="'+i+'" aria-label="Remove scene"'+(rows.length===1?' disabled':'')+'>×</button></div></div>'; });
  return h+'</div><button type="button" class="btn" data-act="scene-add">'+ic("plus",18)+' Add another scene</button>';
}
function renderSheet(){
  var sh=S.sheet; if(!sh) return '';
  var h='<div class="scrim" data-act="scrim"><div class="sheet" role="dialog" aria-modal="true">';
  var p=prod();
  if(sh.type==="cue"){
    var d=sh.draft, acts=actionsFor(d.dept);
    h+='<h2>'+(sh.isNew?'New cue':'Edit cue '+numberOf(d))+'</h2>';
    if(sh.isNew && myDepts().length>1) h+='<div class="seg" role="group" aria-label="Department"><button data-act="cue-dept" data-d="sound" aria-pressed="'+(d.dept==="sound")+'">Sound</button><button data-act="cue-dept" data-d="lighting" aria-pressed="'+(d.dept==="lighting")+'">Lighting</button></div>';
    h+='<div class="field"><label>What happens</label><div class="acts">'+acts.map(function(a){ return '<button class="act" style="--ac:'+a.color+'" data-act="pick-action" data-a="'+a.id+'" aria-pressed="'+(d.action===a.id)+'">'+a.label+'</button>'; }).join('')+'</div></div>';
    if(d.dept==="sound"){
      h+=field("label","Track or sound",d.label,"e.g. Opening theme")+field("trigger","Trigger (the line or action that cues it)",d.trigger,"e.g. After “We have to go now”")
        +field("len","Length (m:ss)",d.len,"e.g. 1:30");
    }else{
      h+=field("label","What is lit",d.label,"e.g. Stage wash, spotlight on the door")
        +'<div class="field"><label>Colour</label><div class="sw">'+SWATCHES.map(function(c){ return '<button data-act="pick-color" data-c="'+c+'" style="background:'+c+'" aria-label="Colour '+c+'" aria-pressed="'+(String(d.color).toUpperCase()===c)+'"></button>'; }).join('')
        +'<input type="color" data-f="colorpick" value="'+esc(/^#[0-9a-f]{6}$/i.test(d.color)?d.color:"#ffffff")+'" aria-label="Pick any colour"></div></div>'
        +(d.action==="lfadein"||d.action==="lfadeout"?field("len","Fade time (seconds)",d.len||"","e.g. 3",{type:"number"}):'')
        +field("trigger","Trigger (the line or action that cues it)",d.trigger,"e.g. When the door closes");
    }
    h+=area("note","Note for the booth",d.note,"e.g. Keep low under dialogue",2)
      +rowBtns("Cancel","save-cue","Save cue")
      +(sh.isNew?'':'<div class="sheetrow"><button class="btn" data-act="dup-cue">Duplicate</button><button class="btn danger'+(sh.confirm?' armed':'')+'" data-act="del-cue">'+(sh.confirm?'Tap again to delete':'Delete cue')+'</button></div>');
  }
  else if(sh.type==="prod-menu"){
    h+='<h2>Productions</h2><div class="chips" style="flex-direction:column;overflow:visible;gap:8px">'
      +S.prods.map(function(x){ return '<button class="li" data-act="switch-prod" data-id="'+x.id+'"'+(x.id===S.pid?' style="border-color:var(--accent)"':'')+'><b>'+esc(x.name)+'</b><small>'+x.scenes.length+' scenes</small></button>'; }).join('')+'</div>'
      +(S.prods.length?'':'<p class="muted">No productions yet.</p>')
      +(isAdmin()?'<button class="btn primary block" data-act="new-prod">'+ic("plus",18)+' New production</button>':'')+'<button class="btn block" data-act="close">Close</button>';
  }
  else if(sh.type==="new-prod"||sh.type==="edit-prod"){
    var isNew=sh.type==="new-prod";
    h+='<h2>'+(isNew?'New production':'Edit production')+'</h2>'+field("pname","Production name",sh.name,"e.g. Easter drama")
      +'<div class="field"><label>Scenes</label><p class="hint">Type a scene name, then press Next. Add or move scenes with the controls.</p>'+renderSceneRows(sh.scenes)+'</div>'
      +(sh.err?'<p class="err">'+esc(sh.err)+'</p>':'')
      +rowBtns("Cancel",isNew?"create-prod":"save-prod",isNew?"Create":"Save");
  }
  else if(sh.type==="member"){
    var u=userById(sh.uid)||{name:"Person"};
    h+='<h2>'+esc(u.name)+'</h2><div class="field"><label>Roles in '+esc(p.name)+'</label><p class="hint">A person can have more than one role in this production.</p><div class="roles">'
      +ROLES.map(function(r){ return '<button class="role" data-act="member-role" data-r="'+r.id+'" aria-pressed="'+(sh.roles.indexOf(r.id)>-1)+'">'+r.label+'</button>'; }).join('')+'</div></div>'
      +field("character","Character / part in this production",sh.character,"e.g. Layla")+'<p class="hint">Assign the character or part this person plays in this production.</p>'
      +rowBtns("Close","save-member","Save roles")+'<button class="btn danger block'+(sh.confirm?' armed':'')+'" data-act="remove-member">'+(sh.confirm?'Tap again to remove':'Remove from production')+'</button>';
  }
  else if(sh.type==="add-member"){
    var avail=S.users.filter(function(x){ return !(p.members||{})[x.uid]; });
    h+='<h2>Add to '+esc(p.name)+'</h2>';
    if(!avail.length) h+='<p class="muted">Everyone with an account is already in this production. An admin can create new accounts in the Team tab.</p>';
    else{
      h+='<div class="chips" style="flex-direction:column;overflow:visible;gap:8px">'+avail.map(function(x){ return '<button class="li" data-act="pick-person" data-id="'+x.uid+'"'+(sh.uid===x.uid?' style="border-color:var(--accent)"':'')+'><span><b>'+esc(x.name)+'</b><br><small>@'+esc(x.username)+'</small></span>'+(sh.uid===x.uid?ic("check",18):'')+'</button>'; }).join('')+'</div>'
        +'<div class="field"><label>Roles</label><p class="hint">Choose every role this person has in this production.</p><div class="roles">'+ROLES.map(function(r){ return '<button class="role" data-act="pick-role" data-r="'+r.id+'" aria-pressed="'+(sh.role.indexOf(r.id)>-1)+'">'+r.label+'</button>'; }).join('')+'</div></div>';
    }
    if(sh.err) h+='<p class="err">'+esc(sh.err)+'</p>';
    h+='<div class="sheetrow stick"><button class="btn" data-act="close">Cancel</button>'+(avail.length?'<button class="btn primary" data-act="do-add-member"'+(sh.uid?'':' disabled')+'>Add</button>':'')+'</div>';
  }
  else if(sh.type==="new-user"){
    h+='<h2>New person</h2>';
    if(sh.created){
      h+='<div class="card"><p class="ok">Account created.</p><p>Give '+esc(sh.created.name)+' these details:</p><p><b>Username:</b> '+esc(sh.created.username)+'<br><b>Code:</b> '+esc(sh.created.code)+'</p>'
        +'<p class="hint">Write the code down now. It cannot be shown again. Only an admin can issue account codes.</p></div>'
        +'<button class="btn primary block" data-act="copy-creds">Copy details</button><button class="btn block" data-act="close">Done</button>';
    }else{
      h+=field("name","Full name",sh.name,"e.g. Mariam Samir")+field("username","Username",sh.username,"e.g. mariam",{nocap:true})
        +field("code","Code (at least 6 characters)",sh.code,"e.g. light2026",{nocap:true,last:true})
        +'<button class="toggle" data-act="toggle-admin" aria-pressed="'+(!!sh.isAdmin)+'"><i>'+(sh.isAdmin?ic("check",14):'')+'</i>Also make this person an admin</button>'
        +(sh.err?'<p class="err">'+esc(sh.err)+'</p>':'')+rowBtns("Cancel","create-user",S.busy?"Creating…":"Create account");
    }
  }
  else if(sh.type==="note"){
    var d2=sh.draft, dir=isDirector();
    h+='<h2>New note</h2>';
    if(dir){
      h+='<div class="seg" role="group" aria-label="Who is it for"><button data-act="note-kind" data-k="private" aria-pressed="'+(d2.kind==="private")+'">To myself</button><button data-act="note-kind" data-k="direct" aria-pressed="'+(d2.kind==="direct")+'">To a person</button></div>';
      if(d2.kind==="direct"){
        var ppl=Object.keys(p.members||{}).filter(function(id){ return id!==S.user.uid; });
        h+='<div class="field"><label>Send to</label><div class="chips" style="flex-direction:column;overflow:visible;gap:8px">'+(ppl.length?ppl.map(function(id){ return '<button class="li" data-act="note-to" data-id="'+id+'"'+(d2.to===id?' style="border-color:var(--accent)"':'')+'><span><b>'+esc(nameOf(id))+'</b> <small>'+esc(roleLabel(p.members[id]))+'</small></span>'+(d2.to===id?ic("check",18):'')+'</button>'; }).join(''):'<p class="muted">No one else is in this production yet.</p>')+'</div></div>';
      }
    }else h+='<p class="hint">Only you can see this note.</p>';
    h+=area("text","Note",d2.text,"e.g. Take the second line slower",4)+(sh.err?'<p class="err">'+esc(sh.err)+'</p>':'')+rowBtns("Cancel","save-note","Save note");
  }
  else if(sh.type==="script"){
    var sc=p.scenes.filter(function(x){return x.id===sh.sceneId;})[0];
    h+='<h2>'+(sh.text?'Edit script':'Add script')+' · '+esc(sc?sc.name:'Scene')+'</h2>'
      +area("scriptText","Scene script",sh.text,"Paste or type the script for this scene",12)
      +(sh.err?'<p class="err">'+esc(sh.err)+'</p>':'')+rowBtns("Cancel","save-script","Save script");
  }
  else if(sh.type==="event"){
    h+='<h2>'+(sh.id?'Edit date':'Add a date')+'</h2>'
      +'<div class="seg"><button data-act="event-kind" data-k="rehearsal" aria-pressed="'+(sh.kind==="rehearsal")+'">Rehearsal</button><button data-act="event-kind" data-k="show" aria-pressed="'+(sh.kind==="show")+'">Production</button></div>'
      +field("eventTitle","Name",sh.title,"e.g. Full cast rehearsal")
      +field("eventDate","Date",sh.date,"",{type:"date"})+field("eventTime","Time",sh.time,"",{type:"time"})
      +'<div class="field"><label>'+(sh.kind==="show"?'Who can RSVP?':'Who should see this rehearsal?')+'</label><div class="sheetrow"><button class="btn" data-act="event-all">All production members</button><button class="btn" data-act="event-none">Clear selection</button></div><div class="chips attendee-list">'
      +Object.keys(p.members||{}).filter(function(id){return roleList(p.members[id]).indexOf("director")===-1;}).map(function(id){ return '<button class="chip" data-act="event-attendee" data-id="'+id+'" aria-pressed="'+(sh.memberIds.indexOf(id)>-1)+'">'+esc(nameOf(id))+'</button>'; }).join('')
      +'</div><p class="hint">'+(sh.kind==="show"?'Show dates are visible to all Manara users. Only selected production members can RSVP.':'Only selected people in this production can see this rehearsal. Directors are always included.')+'</p></div>'
      +(sh.err?'<p class="err">'+esc(sh.err)+'</p>':'')+rowBtns("Cancel","save-event","Save date");
  }
  h+='</div></div>';
  return h;
}

/* ===== sheets: open/close, keep text when re-rendering ===== */
function focusSheetField(selector){ var t=document.querySelector(selector); if(t){ try{t.focus();}catch(e){} } }
function openSheet(sh){
  S.sheet=sh; render();
  if(sh.type==="new-prod"||sh.type==="edit-prod") focusSheetField('.sheet input[data-f="pname"]');
  else if(sh.type==="new-user") focusSheetField('.sheet input[data-f="name"]');
  else if(sh.type==="event") focusSheetField('.sheet input[data-f="eventTitle"]');
  else if(sh.type==="script") focusSheetField('.sheet textarea[data-f="scriptText"]');
  else if(sh.type==="note") focusSheetField('.sheet textarea[data-f="text"]');
  else if(sh.type==="code") focusSheetField('.sheet input[data-f="code"]');
}
function closeSheet(){ S.sheet=null; S.dirty=false; render(); }
function setDraft(k,v){
  var sh=S.sheet; if(!sh) return;
  if(sh.type==="cue"){ if(k==="colorpick"){ sh.draft.color=v; } else sh.draft[k]=v; }
  else if(sh.type==="note"){ sh.draft[k]=v; }
  else if(sh.type==="script"){ if(k==="scriptText") sh.text=v; }
  else if(sh.type==="event"){ if(k==="eventTitle") sh.title=v; else if(k==="eventDate") sh.date=v; else if(k==="eventTime") sh.time=v; }
  else sh[k==="pname"?"name":k]=v;
}

/* ===== data wiring ===== */
function stopAll(){
  ["users","prods","cues","notes","events","publicShows","highlights","scripts"].forEach(function(k){ if(unsub[k]){ try{ unsub[k](); }catch(e){} unsub[k]=null; } });
  Object.keys(unsub.responses||{}).forEach(function(k){ try{unsub.responses[k]();}catch(e){} }); unsub.responses={};
}
function watchEventResponses(pid,events){
  var wanted={};
  events.forEach(function(e){
    var eventPid=e.pid||pid, member=S.prods.some(function(x){return x.id===eventPid;});
    if(isAdmin()||(member&&(e.memberIds||[]).indexOf(S.user.uid)>-1)) wanted[eventPid+":"+e.id]=e;
  });
  Object.keys(unsub.responses).forEach(function(key){ if(!wanted[key]){ try{unsub.responses[key]();}catch(e){} delete unsub.responses[key]; delete S.responses[key.split(":").pop()]; } });
  Object.keys(wanted).forEach(function(key){ var e=wanted[key], eventPid=e.pid||pid; if(!unsub.responses[key]) unsub.responses[key]=DB.watchResponses(eventPid,e.id,function(list){ S.responses[e.id]=list; softRender(); }); });
}
function startWatch(){
  stopAll();
  var syncedProds="";
  unsub.users=DB.watchUsers(function(l){ S.users=l; softRender(); });
  unsub.publicShows=DB.watchPublicShows(function(l){ S.publicShows=l; watchEventResponses(S.pid,allVisibleEvents()); softRender(); });
  unsub.prods=DB.watchProductions(S.user,function(l){
    S.prods=l;
    var prodSignature=l.map(function(x){return x.id+":"+x.name;}).sort().join("|");
    if(isAdmin()&&prodSignature&&prodSignature!==syncedProds){
      syncedProds=prodSignature;
      DB.syncPublicShows(l).catch(function(e){syncedProds="";toast("Could not update the shared show dates: "+err(e));});
    }
    var saved=null; try{ saved=localStorage.getItem("manara-pid"); }catch(e){}
    if(!prod()){ var pick=l.filter(function(x){ return x.id===saved; })[0]||l[0]; selectProd(pick?pick.id:null); }
    watchEventResponses(S.pid,allVisibleEvents());
    softRender();
  });
}
function selectProd(id){
  S.pid=id; S.cues=[]; S.notes=[]; S.events=[]; S.responses={}; S.scripts=[]; S.highlights=[]; S.sceneId=null; S.live=null;
  try{ if(id) localStorage.setItem("manara-pid",id); }catch(e){}
  ["cues","notes","events","highlights","scripts"].forEach(function(k){ if(unsub[k]){ try{ unsub[k](); }catch(e){} unsub[k]=null; } });
  Object.keys(unsub.responses||{}).forEach(function(k){try{unsub.responses[k]();}catch(e){}}); unsub.responses={};
  if(id && S.user){
    unsub.cues=DB.watchCues(id,function(l){ S.cues=l; softRender(); });
    unsub.notes=DB.watchNotes(id,S.user.uid,function(l){ S.notes=l; softRender(); });
    unsub.events=DB.watchEvents(id,S.user,function(l){ S.events=l; watchEventResponses(id,allVisibleEvents()); softRender(); });
    unsub.scripts=DB.watchScripts(id,function(l){ S.scripts=l; softRender(); });
  }
  watchCurrentHighlights();
}
function onUser(u){
  var fresh = u && (!S.user || S.user.uid!==u.uid);
  S.user=u; S.ready=true; S.busy=false; if(u) S.form={};
  if(fresh){ S.tab="home"; S.prodView="overview"; S.dept="all"; S.sceneId=null; S.live=null; S.sheet=null; }
  if(u){ S.authErr=""; startWatch(); } else { stopAll(); S.prods=[]; S.cues=[]; S.notes=[]; S.events=[]; S.publicShows=[]; S.highlights=[]; S.scripts=[]; S.responses={}; S.users=[]; S.pid=null; S.live=null; S.sheet=null; }
  render();
}
function saveProd(p){
  p.memberIds=Object.keys(p.members||{});
  return absorb(DB.saveProduction(p),"Could not save");
}
function parseScenes(rows){ return rows.map(function(x){ return {id:x.id||uid(),name:String(x.name||"").trim()}; }).filter(function(x){ return !!x.name; }); }

/* ===== actions ===== */
function livePos(dept){ var k="manara-live-"+S.pid+"-"+dept; try{ var v=localStorage.getItem(k); return v?parseInt(v,10):-1; }catch(e){ return -1; } }
function setLiveIdx(i){ var f=liveList(); S.live.idx=Math.max(-1,Math.min(f.length,i)); try{ localStorage.setItem("manara-live-"+S.pid+"-"+S.live.dept,String(S.live.idx)); }catch(e){} }
function handle(act, el){
  var p=prod(), s=scene();
  switch(act){
    case "reload": location.reload(); break;
    case "login":
      var u=(document.getElementById("f_username")||{}).value, c=(document.getElementById("f_code")||{}).value;
      if(!u||!c){ S.authErr="Enter your username and code."; render(); break; }
      S.busy=true; S.authErr=""; render();
      DB.login(u,c).then(function(){ /* onAuth will continue */ }).catch(function(e){ S.busy=false; S.authErr=err(e); render(); });
      break;
    case "setup":
      var nm=(document.getElementById("f_name")||{}).value||"", un=(document.getElementById("f_username")||{}).value||"", cd=(document.getElementById("f_code")||{}).value||"";
      if(!nm.trim()||!ManaraDB.cleanUsername(un)||cd.length<6){ S.authErr="Fill in all three. The code needs at least 6 characters."; render(); break; }
      S.busy=true; S.authErr=""; render();
      DB.setupAdmin({name:nm.trim(),username:un,code:cd}).then(function(){ S.needsSetup=false; }).catch(function(e){ S.busy=false; S.authErr=err(e); render(); });
      break;
    case "logout": DB.logout(); break;
    case "theme-toggle":
      S.theme=effectiveTheme()==="dark"?"light":"dark";
      try{localStorage.setItem("manara-theme",S.theme);}catch(e){}
      render(); break;
    case "language-toggle": S.lang=S.lang==="ar"?"en":"ar"; try{localStorage.setItem("manara-language",S.lang);}catch(e){} render(); break;
    case "tab": var nextTab=el.getAttribute("data-t"); if(nextTab!==S.tab) S.lastTab=S.tab; S.tab=nextTab; watchCurrentHighlights(); if(S.tab==="calendar"&&!S.calMonth){var cd0=new Date();S.calMonth=new Date(cd0.getFullYear(),cd0.getMonth(),1);S.calSelected=dayKey(cd0.getTime());} render(); window.scrollTo(0,0); break;
    case "cal-mode": S.calMode=el.getAttribute("data-v"); render(); break;
    case "cal-day": S.calSelected=el.getAttribute("data-date"); render(); break;
    case "cal-nav": var dm=new Date(S.calMonth.getFullYear(),S.calMonth.getMonth()+parseInt(el.getAttribute("data-d"),10),1); S.calMonth=dm; S.calSelected=dayKey(dm.getTime()); render(); break;
    case "cal-today": var td=new Date(); S.calMonth=new Date(td.getFullYear(),td.getMonth(),1); S.calSelected=dayKey(td.getTime()); render(); break;
    case "prod-view": if(S.tab==="production") S.lastProdView=S.prodView; else S.lastTab=S.tab; S.tab="production"; S.prodView=el.getAttribute("data-v"); watchCurrentHighlights(); render(); window.scrollTo(0,0); break;
    case "go-notes": if(S.tab==="production") S.lastProdView=S.prodView; else S.lastTab=S.tab; S.tab="production"; S.prodView="notes"; watchCurrentHighlights(); render(); break;
    case "dept": S.dept=el.getAttribute("data-d"); render(); break;
    case "scene": S.sceneId=el.getAttribute("data-id"); watchCurrentHighlights(); render(); break;
    case "prod-menu": openSheet({type:"prod-menu"}); break;
    case "switch-prod": selectProd(el.getAttribute("data-id")); S.sheet=null; render(); break;

    case "new-prod": openSheet({type:"new-prod",name:"",scenes:[{id:uid(),name:""}],err:""}); break;
    case "create-prod":
      var nme=(S.sheet.name||"").trim(); if(!nme){ S.sheet.err="Give the production a name."; render(); break; }
      var newScenes=parseScenes(S.sheet.scenes); if(!newScenes.length){ S.sheet.err="Name at least one scene."; render(); break; }
      var np={id:uid(),name:nme,scenes:newScenes,members:{},createdBy:S.user.uid,createdAt:Date.now()};
      np.members[S.user.uid]=["director"];
      saveProd(np).then(function(){ selectProd(np.id); S.tab="home"; closeSheet(); });
      break;
    case "edit-prod": openSheet({type:"edit-prod",name:p.name,scenes:p.scenes.map(function(x){ return {id:x.id,name:x.name}; }),err:""}); break;
    case "save-prod":
      var nn=(S.sheet.name||"").trim(); if(!nn){ S.sheet.err="The production needs a name."; render(); break; }
      var scs=parseScenes(S.sheet.scenes); if(!scs.length){ S.sheet.err="Keep at least one named scene."; render(); break; }
      var kept={}; scs.forEach(function(x){kept[x.id]=true;}); var removed=p.scenes.filter(function(x){return !kept[x.id];});
      var orphan=S.cues.filter(function(c){ return removed.some(function(r){ return r.id===c.sceneId; }); });
      var orphanScripts=S.scripts.filter(function(x){return removed.some(function(r){return r.id===x.id;});});
      if((orphan.length||orphanScripts.length) && !S.sheet.confirm){ S.sheet.confirm=true; S.sheet.err="Removing these scenes also removes "+orphan.length+" cue(s) and "+orphanScripts.length+" script(s). Tap Save again to confirm."; render(); break; }
      p.name=nn; p.scenes=scs; orphan.forEach(function(c){ DB.deleteCue(p.id,c.id); }); orphanScripts.forEach(function(x){DB.deleteScript(p.id,x.id);});
      saveProd(p).then(function(){ closeSheet(); });
      break;

    case "scene-add": S.sheet.scenes.push({id:uid(),name:""}); render(); focusSheetField('.sheet input[data-scene="'+(S.sheet.scenes.length-1)+'"]'); break;
    case "scene-remove": if(S.sheet.scenes.length>1){ S.sheet.scenes.splice(parseInt(el.getAttribute("data-i"),10),1); render(); } break;
    case "scene-up": case "scene-down":
      var si=parseInt(el.getAttribute("data-i"),10), sj=act==="scene-up"?si-1:si+1;
      if(sj>=0&&sj<S.sheet.scenes.length){ var temp=S.sheet.scenes[si]; S.sheet.scenes[si]=S.sheet.scenes[sj]; S.sheet.scenes[sj]=temp; render(); focusSheetField('.sheet input[data-scene="'+sj+'"]'); } break;
    case "add-member": openSheet({type:"add-member",uid:null,role:["actor"]}); break;
    case "pick-person": S.sheet.uid=el.getAttribute("data-id"); render(); break;
    case "pick-role": var role=el.getAttribute("data-r"), ix=S.sheet.role.indexOf(role); if(ix>-1) S.sheet.role.splice(ix,1); else S.sheet.role.push(role); render(); break;
    case "do-add-member": if(S.sheet.uid&&S.sheet.role.length){ p.members[S.sheet.uid]=S.sheet.role.slice(); saveProd(p).then(function(){ closeSheet(); }); } else { S.sheet.err="Choose a person and at least one role."; render(); } break;
    case "member": var memberId=el.getAttribute("data-id"); openSheet({type:"member",uid:memberId,roles:roleList(p.members[memberId]).slice(),character:(p.characters||{})[memberId]||"",confirm:false}); break;
    case "member-role": var mrole=el.getAttribute("data-r"), mix=S.sheet.roles.indexOf(mrole); if(mix>-1) S.sheet.roles.splice(mix,1); else S.sheet.roles.push(mrole); render(); break;
    case "save-member": if(S.sheet.roles.length){p.members[S.sheet.uid]=S.sheet.roles.slice();p.characters=p.characters||{};if((S.sheet.character||"").trim())p.characters[S.sheet.uid]=S.sheet.character.trim();else delete p.characters[S.sheet.uid];saveProd(p).then(function(){closeSheet();});}else{S.sheet.err="Choose at least one role.";render();} break;
    case "remove-member":
      if(!S.sheet.confirm){ S.sheet.confirm=true; render(); break; }
      delete p.members[S.sheet.uid]; if(p.characters)delete p.characters[S.sheet.uid]; saveProd(p).then(function(){ closeSheet(); }); break;

    case "new-user": openSheet({type:"new-user",name:"",username:"",code:"",isAdmin:false,err:"",created:null}); break;
    case "toggle-admin": S.sheet.isAdmin=!S.sheet.isAdmin; render(); break;
    case "create-user":
      var sh=S.sheet, un2=ManaraDB.cleanUsername(sh.username);
      if(!(sh.name||"").trim()||!un2){ sh.err="Enter a name and a username (letters and numbers)."; render(); break; }
      if((sh.code||"").length<6){ sh.err="The code needs at least 6 characters."; render(); break; }
      S.busy=true; sh.err=""; render();
      DB.createUser({name:sh.name.trim(),username:un2,code:sh.code,isAdmin:sh.isAdmin}).then(function(){
        S.busy=false; S.sheet.created={name:sh.name.trim(),username:un2,code:sh.code}; render();
      }).catch(function(e){ S.busy=false; if(S.sheet) S.sheet.err=err(e); render(); });
      break;
    case "copy-creds":
      var cr=S.sheet.created, txt="Manara app\nUsername: "+cr.username+"\nCode: "+cr.code;
      try{ if(navigator.clipboard) navigator.clipboard.writeText(txt).then(function(){ toast("Copied"); },function(){ toast("Could not copy. Write it down."); }); else toast("Write it down."); }catch(e){ toast("Write it down."); }
      break;

    case "add-cue":
      var dpt=myDepts()[0]; if(!dpt) break;
      openSheet({type:"cue",isNew:true,confirm:false,draft:{id:uid(),dept:dpt,sceneId:s.id,action:actionsFor(dpt)[0].id,label:"",trigger:"",len:"",note:"",color:"#FFFFFF"}}); break;
    case "cue-dept": var nd=el.getAttribute("data-d"); S.sheet.draft.dept=nd; S.sheet.draft.action=actionsFor(nd)[0].id; render(); break;
    case "edit-cue":
      var fc=S.cues.filter(function(c){ return c.id===el.getAttribute("data-id"); })[0];
      if(fc && canEditDept(fc.dept)){ var d=JSON.parse(JSON.stringify(fc)); d.len=fc.len?(fc.dept==="sound"?fmt(fc.len):String(fc.len)):""; d.color=d.color||"#FFFFFF"; openSheet({type:"cue",isNew:false,confirm:false,draft:d}); } break;
    case "pick-action": S.sheet.draft.action=el.getAttribute("data-a"); render(); break;
    case "pick-color": S.sheet.draft.color=el.getAttribute("data-c"); render(); break;
    case "save-cue":
      var dr=S.sheet.draft, rec={id:dr.id,dept:dr.dept,sceneId:dr.sceneId,action:dr.action,label:(dr.label||"").trim(),trigger:(dr.trigger||"").trim(),note:(dr.note||"").trim(),
        order:dr.order||Date.now(),by:S.user.uid};
      if(dr.dept==="sound") rec.len=parseLen(dr.len); else { rec.color=dr.color||"#FFFFFF"; if((dr.action==="lfadein"||dr.action==="lfadeout")&&parseInt(dr.len,10)>0) rec.len=parseInt(dr.len,10); }
      absorb(DB.saveCue(p.id,rec)).then(function(){ closeSheet(); });
      break;
    case "dup-cue":
      var src=S.sheet.draft, cp={id:uid(),dept:src.dept,sceneId:src.sceneId,action:src.action,label:src.label,trigger:src.trigger,note:src.note,order:(src.order||Date.now())+1,by:S.user.uid};
      if(src.dept==="sound") cp.len=parseLen(src.len); else { cp.color=src.color; if(src.len) cp.len=parseInt(src.len,10); }
      absorb(DB.saveCue(p.id,cp)).then(function(){ closeSheet(); }); break;
    case "del-cue":
      if(!S.sheet.confirm){ S.sheet.confirm=true; render(); break; }
      absorb(DB.deleteCue(p.id,S.sheet.draft.id)).then(function(){ closeSheet(); }); break;
    case "up": case "down":
      var id=el.getAttribute("data-id"), me=S.cues.filter(function(c){ return c.id===id; })[0]; if(!me) break;
      var same=S.cues.filter(function(c){ return c.sceneId===me.sceneId&&c.dept===me.dept; }).sort(function(a,b){ return (a.order||0)-(b.order||0); });
      var i0=same.indexOf(me), i1=act==="up"?i0-1:i0+1;
      if(i1>=0&&i1<same.length){ var o=same[i1], a1=me.order, b1=o.order; if(a1===b1) b1=a1+(act==="up"?-1:1);
        var m2=Object.assign({},me,{order:b1}), o2=Object.assign({},o,{order:a1});
        S.cues=S.cues.map(function(c){ return c.id===m2.id?m2:(c.id===o2.id?o2:c); }); render();
        DB.saveCue(p.id,m2); DB.saveCue(p.id,o2); }
      break;

    case "add-note": openSheet({type:"note",err:"",draft:{kind:"private",to:null,text:"",sceneId:s?s.id:null}}); break;
    case "note-kind": S.sheet.draft.kind=el.getAttribute("data-k"); render(); break;
    case "note-to": S.sheet.draft.to=el.getAttribute("data-id"); render(); break;
    case "save-note":
      var nd2=S.sheet.draft;
      if(!(nd2.text||"").trim()){ S.sheet.err="Write the note first."; render(); break; }
      if(nd2.kind==="direct" && !nd2.to){ S.sheet.err="Choose who the note is for."; render(); break; }
      var scn=p.scenes[sceneIndex(nd2.sceneId)], note={id:uid(),sceneId:nd2.sceneId,sceneName:scn?scn.name:"",author:S.user.uid,text:nd2.text.trim(),at:Date.now()};
      if(nd2.kind==="direct") note.to=nd2.to;
      absorb(DB.saveNote(p.id,note)).then(function(){ closeSheet(); }); break;
    case "del-note": absorb(DB.deleteNote(p.id,el.getAttribute("data-id"))); break;

    case "edit-script":
      var sid=el.getAttribute("data-id"), oldScript=S.scripts.filter(function(x){return x.id===sid;})[0];
      openSheet({type:"script",sceneId:sid,text:oldScript?oldScript.text:"",err:""}); break;
    case "save-script":
      if(!isDirector()) break;
      if((S.sheet.text||"").length>200000){S.sheet.err="This scene’s script is too long. Split it across scenes.";render();break;}
      absorb(DB.saveScript(p.id,{id:S.sheet.sceneId,sceneId:S.sheet.sceneId,text:S.sheet.text||"",updatedBy:S.user.uid,updatedAt:Date.now()}),"Could not save script").then(function(){closeSheet();}); break;
    case "script-highlight":
      var sel=S.pendingHighlight||selectedScriptRange(), shade=el.getAttribute("data-color"), activeScene=scene(), activeScript=activeScene&&S.scripts.filter(function(x){return x.id===activeScene.id;})[0];
      S.pendingHighlight=null;
      if(!sel||!activeScript){toast("Select some script text first.");break;}
      if(sel.end-sel.start>20000){toast("Choose a shorter passage to highlight.");break;}
      var snippet=activeScript.text.slice(sel.start,sel.end), updated=[];
      S.highlights.forEach(function(mark){
        if(mark.end<=sel.start||mark.start>=sel.end) updated.push(mark);
        else{
          if(mark.start<sel.start) updated.push(Object.assign({},mark,{end:sel.start,quote:activeScript.text.slice(mark.start,sel.start)}));
          if(mark.end>sel.end) updated.push(Object.assign({},mark,{start:sel.end,quote:activeScript.text.slice(sel.end,mark.end)}));
        }
      });
      updated.push({start:sel.start,end:sel.end,color:shade,quote:snippet});
      updated.sort(function(a,b){return a.start-b.start;}); S.highlights=updated; render();
      absorb(DB.saveHighlights(p.id,activeScene.id,S.user.uid,updated),"Could not save your highlights"); break;
    case "clear-highlights":
      var clearScene=scene(); if(!clearScene) break; S.highlights=[]; render();
      absorb(DB.saveHighlights(p.id,clearScene.id,S.user.uid,[]),"Could not clear your highlights"); break;

    case "new-event": openSheet({type:"event",kind:"rehearsal",title:"",date:dateInputValue(Date.now()+86400000),time:"19:00",memberIds:Object.keys(p.members||{}),err:""}); break;
    case "edit-event":
      var ev0=S.events.filter(function(x){return x.id===el.getAttribute("data-id");})[0];
      if(ev0) openSheet({type:"event",id:ev0.id,kind:ev0.kind,title:ev0.title,date:dateInputValue(ev0.startsAt),time:timeInputValue(ev0.startsAt),memberIds:(ev0.memberIds||[]).slice(),err:""}); break;
    case "event-kind": S.sheet.kind=el.getAttribute("data-k"); render(); break;
    case "event-all": S.sheet.memberIds=Object.keys(p.members||{}); render(); break;
    case "event-none": S.sheet.memberIds=[]; render(); break;
    case "event-attendee":
      var aid=el.getAttribute("data-id"), ai=S.sheet.memberIds.indexOf(aid);
      if(ai>-1) S.sheet.memberIds.splice(ai,1); else S.sheet.memberIds.push(aid); render(); break;
    case "save-event":
      var es=S.sheet, start=es.date?new Date(es.date+"T"+(es.time||"19:00")).getTime():NaN;
      if(!(es.title||"").trim()){es.err="Give this date a name.";render();break;}
      if(!Number.isFinite(start)){es.err="Choose a valid date and time.";render();break;}
      var directors=Object.keys(p.members||{}).filter(function(id){return roleList(p.members[id]).indexOf("director")>-1;});
      var chosen=directors.concat(es.memberIds||[]).filter(function(id,i,a){return a.indexOf(id)===i&&(p.memberIds||[]).indexOf(id)>-1;});
      if(!chosen.length){es.err="Choose at least one person to see this date.";render();break;}
      absorb(DB.saveEvent(p.id,{id:es.id||uid(),pid:p.id,productionName:p.name,kind:es.kind,title:es.title.trim(),startsAt:start,memberIds:chosen,createdBy:es.id?(S.events.filter(function(x){return x.id===es.id;})[0]||{}).createdBy||S.user.uid:S.user.uid,updatedAt:Date.now()}),"Could not save date").then(function(){closeSheet();}); break;
    case "del-event":
      var eid=el.getAttribute("data-id");
      if(S.confirmEventDelete!==eid){S.confirmEventDelete=eid;render();break;}
      S.confirmEventDelete=null; absorb(DB.deleteEvent(p.id,eid),"Could not delete date"); break;
    case "rsvp":
      var reid=el.getAttribute("data-id"), rv=el.getAttribute("data-r");
      var replyEvent=allVisibleEvents().filter(function(x){return x.id===reid;})[0], replyPid=replyEvent&&replyEvent.pid||p.id;
      if(!replyEvent||!replyEvent.memberIds||replyEvent.memberIds.indexOf(S.user.uid)===-1){toast("Only invited production members can reply to this date.");break;}
      absorb(DB.saveResponse(replyPid,reid,S.user.uid,rv),"Could not save your reply"); break;

    case "open-live":
      var dd=myDepts(); if(!dd.length){ toast("Live mode is for sound and lighting."); break; }
      var dep=dd.indexOf(S.dept)>-1?S.dept:dd[0]; S.live={dept:dep,idx:-1}; S.live.idx=Math.min(livePos(dep),liveList().length); render(); break;
    case "live-dept": S.live.dept=S.live.dept==="sound"?"lighting":"sound"; S.live.idx=Math.min(livePos(S.live.dept),liveList().length); render(); break;
    case "exit-live": S.live=null; render(); break;
    case "go": setLiveIdx(S.live.idx+1); render(); try{ if(navigator.vibrate) navigator.vibrate(12); }catch(e){} break;
    case "back": setLiveIdx(S.live.idx-1); render(); break;
    case "live-note":
      var cc=liveList()[S.live.idx]; if(cc) openSheet({type:"note",err:"",draft:{kind:"private",to:null,text:numberOf(cc)+": ",sceneId:cc.sceneId}}); break;

    case "close": closeSheet(); break;
    case "scrim": if(el===S.__scrimTarget) closeSheet(); break;
  }
}

/* ===== events: taps (pointer + click, de-duplicated), typing, keyboard ===== */
var lastFire=0, lastEl=null, swallowUntil=0;
document.addEventListener("pointerdown",function(ev){
  var button=ev.target&&ev.target.closest?ev.target.closest('[data-act="script-highlight"]'):null;
  if(button) S.pendingHighlight=selectedScriptRange();
});
function fire(ev,viaTap){
  var el=ev.target&&ev.target.closest?ev.target.closest("[data-act]"):null;
  if(!el||el.disabled) return;
  if(el.getAttribute("data-act")==="scrim"){ if(ev.target!==el) return; S.__scrimTarget=el; }
  var now=Date.now();
  if(el===lastEl&&now-lastFire<450) return;
  lastEl=el; lastFire=now; if(viaTap) swallowUntil=now+700;
  try{ handle(el.getAttribute("data-act"),el); }catch(e){ if(window.console) console.error(e); toast("Something went wrong. Try again."); }
}
document.addEventListener("pointerup",function(ev){ if(ev.pointerType==="mouse") return; fire(ev,true); });
document.addEventListener("click",function(ev){ if(Date.now()<swallowUntil) return; fire(ev,false); });
document.addEventListener("input",function(ev){
  var row=ev.target&&ev.target.getAttribute&&ev.target.getAttribute("data-scene");
  if(row!==null&&row!==undefined&&S.sheet&&(S.sheet.type==="new-prod"||S.sheet.type==="edit-prod")){ var n=parseInt(row,10); if(S.sheet.scenes[n]) S.sheet.scenes[n].name=ev.target.value; return; }
  var k=ev.target&&ev.target.getAttribute&&ev.target.getAttribute("data-f"); if(!k) return; if(!S.sheet){ S.form[k]=ev.target.value; return; } setDraft(k,ev.target.value); if(k==="colorpick") { S.sheet.draft.color=ev.target.value; }
});
document.addEventListener("change",function(ev){ var k=ev.target&&ev.target.getAttribute&&ev.target.getAttribute("data-f"); if(k==="colorpick"&&S.sheet){ S.sheet.draft.color=ev.target.value; render(); } });
/* Return key: move to the next field; on the last field close the keyboard (or sign in). */
document.addEventListener("keydown",function(ev){
  var t=ev.target; if(!t||t.tagName!=="INPUT"||ev.key!=="Enter") return;
  if(S.sheet&&(S.sheet.type==="new-prod"||S.sheet.type==="edit-prod")&&t.getAttribute("data-f")==="pname"){
    ev.preventDefault(); focusSheetField('.sheet input[data-scene="0"]'); return;
  }
  var sceneRow=t.getAttribute("data-scene");
  if(sceneRow!==null&&sceneRow!==undefined&&S.sheet){
    ev.preventDefault(); var n=parseInt(sceneRow,10), next=document.querySelector('.sheet input[data-scene="'+(n+1)+'"]');
    if(next){next.focus();return;}
    S.sheet.scenes.push({id:uid(),name:""}); render(); focusSheetField('.sheet input[data-scene="'+(S.sheet.scenes.length-1)+'"]'); return;
  }
  ev.preventDefault();
  var scope=t.closest(".sheet")||t.closest("form")||document;
  var fields=[].slice.call(scope.querySelectorAll("input[data-f]:not([type=color]), textarea[data-f]"));
  var i=fields.indexOf(t);
  if(i>-1&&i<fields.length-1){ fields[i+1].focus(); return; }
  t.blur();
  if(t.closest("form[data-form=login]")) handle("login"); else if(t.closest("form[data-form=setup]")) handle("setup");
});
function fitView(){ var v=window.visualViewport; if(!v) return; var r=document.documentElement.style; r.setProperty("--vvh",v.height+"px"); r.setProperty("--vvt",v.offsetTop+"px"); }
if(window.visualViewport){ window.visualViewport.addEventListener("resize",fitView); window.visualViewport.addEventListener("scroll",fitView); fitView(); }
if(window.matchMedia){
  var colorScheme=window.matchMedia("(prefers-color-scheme: dark)");
  var onSystemTheme=function(){ if(S.theme==="system") render(); };
  if(colorScheme.addEventListener) colorScheme.addEventListener("change",onSystemTheme);
  else if(colorScheme.addListener) colorScheme.addListener(onSystemTheme);
}

/* ===== boot ===== */
async function boot(){
  try{ var savedTheme=localStorage.getItem("manara-theme"), savedLang=localStorage.getItem("manara-language"); if(savedTheme==="light"||savedTheme==="dark") S.theme=savedTheme; if(savedLang==="ar"||savedLang==="en")S.lang=savedLang; }catch(e){}
  render();
  try{
    var cfg=window.MANARA_FIREBASE;
    DB = cfg ? await ManaraDB.makeFirebase(cfg) : ManaraDB.makeDemo();
    var info=await DB.init(); S.needsSetup=info.needsSetup;
    DB.onAuth(onUser);
  }catch(e){ S.fatal="Could not connect to the team database. Check your internet connection and try again."; S.ready=true; render(); }
}
boot();
})();
