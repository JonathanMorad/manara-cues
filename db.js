/* Data layer. Two interchangeable backends with the same methods:
   - makeFirebase(cfg): real shared database (Firebase Auth + Firestore)
   - makeDemo(): everything in this browser's localStorage (for trying the app) */
(function(){
"use strict";
var EMAIL_DOMAIN = "@manara.invalid";
function cleanUsername(u){ return String(u||"").trim().toLowerCase().replace(/[^a-z0-9._-]/g,""); }
function toEmail(u){ return cleanUsername(u)+EMAIL_DOMAIN; }
function plain(o){ return JSON.parse(JSON.stringify(o)); }
function fail(code,msg){ var e = new Error(msg); e.code = code; return e; }

/* ---------------- DEMO (localStorage) ---------------- */
function makeDemo(){
  var KEY = "manara-demo-v2", SKEY = "manara-demo-v2-session", subs = [], authCbs = [];
  function fresh(){ return {setup:false, users:{}, prods:{}, cues:{}, notes:{}, events:{}, responses:{}, scripts:{}, highlights:{}}; }
  function load(){ try{ return JSON.parse(localStorage.getItem(KEY)) || fresh(); }catch(e){ return fresh(); } }
  var d = load(); d.highlights=d.highlights||{};
  function save(){ try{ localStorage.setItem(KEY, JSON.stringify(d)); }catch(e){} subs.slice().forEach(function(f){ f(); }); }
  function sess(){ try{ return localStorage.getItem(SKEY); }catch(e){ return null; } }
  function pub(u){ return u ? {uid:u.uid, username:u.username, name:u.name, isAdmin:!!u.isAdmin} : null; }
  function emitAuth(){ var u = d.users[sess()]; authCbs.forEach(function(cb){ cb(pub(u)); }); }
  function watch(compute, cb){ var f = function(){ cb(plain(compute())); }; subs.push(f); setTimeout(f,0); return function(){ subs = subs.filter(function(x){ return x!==f; }); }; }
  function uid(){ return "u"+Math.random().toString(36).slice(2,10); }
  function byName(n){ for(var k in d.users) if(d.users[k].username===cleanUsername(n)) return d.users[k]; return null; }
  return {
    mode:"demo",
    init:function(){ d = load(); d.highlights=d.highlights||{}; return Promise.resolve({needsSetup: !d.setup}); },
    onAuth:function(cb){ authCbs.push(cb); setTimeout(function(){ cb(pub(d.users[sess()])); },0); },
    setupAdmin:function(o){
      if(d.setup) return Promise.reject(fail("already","Setup is already done."));
      var id = uid(); d.users[id] = {uid:id, username:cleanUsername(o.username), name:o.name, isAdmin:true, code:o.code}; d.setup = true;
      localStorage.setItem(SKEY,id); save(); emitAuth(); return Promise.resolve();
    },
    login:function(username, code){
      var u = byName(username);
      if(!u || u.code!==code) return Promise.reject(fail("bad","Wrong username or code."));
      localStorage.setItem(SKEY,u.uid); emitAuth(); return Promise.resolve();
    },
    logout:function(){ localStorage.removeItem(SKEY); emitAuth(); return Promise.resolve(); },
    createUser:function(o){
      if(byName(o.username)) return Promise.reject(fail("taken","That username is already taken."));
      var id = uid(); d.users[id] = {uid:id, username:cleanUsername(o.username), name:o.name, isAdmin:!!o.isAdmin, code:o.code}; save(); return Promise.resolve(id);
    },
    watchUsers:function(cb){ return watch(function(){ return Object.keys(d.users).map(function(k){ return pub(d.users[k]); }); }, cb); },
    watchProductions:function(user, cb){
      return watch(function(){ return Object.keys(d.prods).map(function(k){ return d.prods[k]; }).filter(function(p){ return user.isAdmin || (p.memberIds||[]).indexOf(user.uid)>-1; }); }, cb);
    },
    saveProduction:function(p){ d.prods[p.id] = plain(p); save(); return Promise.resolve(); },
    watchCues:function(pid, cb){ return watch(function(){ return Object.keys(d.cues).map(function(k){ return d.cues[k]; }).filter(function(c){ return c.pid===pid; }); }, cb); },
    saveCue:function(pid, c){ d.cues[c.id] = Object.assign(plain(c), {pid:pid}); save(); return Promise.resolve(); },
    deleteCue:function(pid, id){ delete d.cues[id]; save(); return Promise.resolve(); },
    watchNotes:function(pid, uid_, cb){
      return watch(function(){ return Object.keys(d.notes).map(function(k){ return d.notes[k]; }).filter(function(n){ return n.pid===pid && (n.author===uid_ || n.to===uid_); }); }, cb);
    },
    saveNote:function(pid, n){ d.notes[n.id] = Object.assign(plain(n), {pid:pid}); save(); return Promise.resolve(); },
    deleteNote:function(pid, id){ delete d.notes[id]; save(); return Promise.resolve(); },
    watchEvents:function(pid, user, cb){ return watch(function(){ return Object.keys(d.events).map(function(k){ return d.events[k]; }).filter(function(e){ return e.pid===pid && (user.isAdmin || (e.memberIds||[]).indexOf(user.uid)>-1); }); }, cb); },
    watchPublicShows:function(cb){ return watch(function(){ return Object.keys(d.events).map(function(k){ return d.events[k]; }).filter(function(e){ return e.kind==="show"; }); }, cb); },
    saveEvent:function(pid, e){ d.events[e.id] = Object.assign(plain(e), {pid:pid}); save(); return Promise.resolve(); },
    deleteEvent:function(pid, id){ delete d.events[id]; Object.keys(d.responses).forEach(function(k){ if(k.indexOf(id+":")===0) delete d.responses[k]; }); save(); return Promise.resolve(); },
    watchResponses:function(pid, eid, cb){ return watch(function(){ return Object.keys(d.responses).map(function(k){ return d.responses[k]; }).filter(function(r){ return r.pid===pid && r.eid===eid; }); }, cb); },
    saveResponse:function(pid, eid, uid_, response){ d.responses[eid+":"+uid_] = {pid:pid,eid:eid,uid:uid_,response:response,updatedAt:Date.now()}; save(); return Promise.resolve(); },
    watchScripts:function(pid, cb){ return watch(function(){ return Object.keys(d.scripts).map(function(k){ return d.scripts[k]; }).filter(function(s){ return s.pid===pid; }); }, cb); },
    watchHighlights:function(pid,sid,uid_,cb){ return watch(function(){ var h=d.highlights[pid+":"+sid+":"+uid_]; return h&&h.highlights||[]; },cb); },
    saveHighlights:function(pid,sid,uid_,h){ d.highlights[pid+":"+sid+":"+uid_]={uid:uid_,highlights:plain(h),updatedAt:Date.now()}; save(); return Promise.resolve(); },
    saveScript:function(pid, s){ d.scripts[s.id] = Object.assign(plain(s), {pid:pid}); save(); return Promise.resolve(); },
    deleteScript:function(pid,id){ delete d.scripts[id]; save(); return Promise.resolve(); }
  };
}

/* ---------------- FIREBASE ---------------- */
async function makeFirebase(cfg){
  var base = "https://www.gstatic.com/firebasejs/10.12.2/";
  var mods = await Promise.all([import(base+"firebase-app.js"), import(base+"firebase-auth.js"), import(base+"firebase-firestore.js")]);
  var A = mods[0], Au = mods[1], F = mods[2];
  var app = A.initializeApp(cfg), auth = Au.getAuth(app);
  var db;
  try{ db = F.initializeFirestore(app, {localCache: F.persistentLocalCache({tabManager: F.persistentMultipleTabManager()})}); }
  catch(e){ db = F.getFirestore(app); }
  function mapAuthError(e){
    var c = (e && e.code) || "";
    if(c==="auth/invalid-credential"||c==="auth/wrong-password"||c==="auth/user-not-found"||c==="auth/invalid-login-credentials") return fail("bad","Wrong username or code.");
    if(c==="auth/email-already-in-use") return fail("taken","That username is already taken.");
    if(c==="auth/weak-password") return fail("weak","The code needs at least 6 characters.");
    if(c==="auth/network-request-failed") return fail("net","No internet connection. Try again when you are online.");
    if(c==="auth/too-many-requests") return fail("many","Too many tries. Wait a minute and try again.");
    if(c==="auth/requires-recent-login") return fail("recent","For safety, sign out, sign in again, then change your code.");
    if(c==="permission-denied"||c==="firestore/permission-denied") return fail("denied","You do not have permission to do that.");
    return e;
  }
  function wrap(p){ return p.catch(function(e){ throw mapAuthError(e); }); }
  function docs(snap){ return snap.docs.map(function(x){ var o = x.data(); o.id = o.id || x.id; return o; }); }
  return {
    mode:"firebase",
    init:async function(){
      try{ var s = await F.getDoc(F.doc(db,"meta","setup")); return {needsSetup: !s.exists()}; }
      catch(e){ return {needsSetup:false}; }
    },
    onAuth:function(cb){
      Au.onAuthStateChanged(auth, async function(u){
        if(!u){ cb(null); return; }
        try{
          var s = await F.getDoc(F.doc(db,"users",u.uid));
          cb(s.exists() ? {uid:u.uid, username:s.data().username, name:s.data().name, isAdmin:!!s.data().isAdmin} : null);
        }catch(e){ cb(null); }
      });
    },
    setupAdmin:function(o){ return wrap((async function(){
      var cred = await Au.createUserWithEmailAndPassword(auth, toEmail(o.username), o.code);
      var batch = F.writeBatch(db);
      batch.set(F.doc(db,"meta","setup"), {done:true, at:Date.now()});
      batch.set(F.doc(db,"users",cred.user.uid), {uid:cred.user.uid, username:cleanUsername(o.username), name:o.name, isAdmin:true});
      await batch.commit();
      var s = F.doc(db,"users",cred.user.uid); void s;
      await Au.signOut(auth); await Au.signInWithEmailAndPassword(auth, toEmail(o.username), o.code);
    })()); },
    login:function(username, code){ return wrap(Au.signInWithEmailAndPassword(auth, toEmail(username), code).then(function(){})); },
    logout:function(){ return Au.signOut(auth); },
    createUser:function(o){ return wrap((async function(){
      var existing = A.getApps().filter(function(a){ return a.name==="secondary"; })[0];
      var app2 = existing || A.initializeApp(cfg, "secondary");
      var auth2 = Au.getAuth(app2);
      var cred = await Au.createUserWithEmailAndPassword(auth2, toEmail(o.username), o.code);
      await Au.signOut(auth2);
      await F.setDoc(F.doc(db,"users",cred.user.uid), {uid:cred.user.uid, username:cleanUsername(o.username), name:o.name, isAdmin:!!o.isAdmin});
      return cred.user.uid;
    })()); },
    watchUsers:function(cb){ return F.onSnapshot(F.collection(db,"users"), function(s){ cb(docs(s)); }, function(){}); },
    watchProductions:function(user, cb){
      var q = user.isAdmin ? F.collection(db,"productions") : F.query(F.collection(db,"productions"), F.where("memberIds","array-contains",user.uid));
      return F.onSnapshot(q, function(s){ cb(docs(s)); }, function(){});
    },
    saveProduction:function(p){ return wrap(F.setDoc(F.doc(db,"productions",p.id), plain(p))); },
    watchCues:function(pid, cb){ return F.onSnapshot(F.collection(db,"productions",pid,"cues"), function(s){ cb(docs(s)); }, function(){}); },
    saveCue:function(pid, c){ return wrap(F.setDoc(F.doc(db,"productions",pid,"cues",c.id), plain(c))); },
    deleteCue:function(pid, id){ return wrap(F.deleteDoc(F.doc(db,"productions",pid,"cues",id))); },
    watchNotes:function(pid, uid, cb){
      var a = [], b = [];
      function push(){ var m = {}; a.concat(b).forEach(function(n){ m[n.id] = n; }); cb(Object.keys(m).map(function(k){ return m[k]; })); }
      var c = F.collection(db,"productions",pid,"notes");
      var u1 = F.onSnapshot(F.query(c, F.where("author","==",uid)), function(s){ a = docs(s); push(); }, function(){});
      var u2 = F.onSnapshot(F.query(c, F.where("to","==",uid)), function(s){ b = docs(s); push(); }, function(){});
      return function(){ u1(); u2(); };
    },
    saveNote:function(pid, n){ return wrap(F.setDoc(F.doc(db,"productions",pid,"notes",n.id), plain(n))); },
    deleteNote:function(pid, id){ return wrap(F.deleteDoc(F.doc(db,"productions",pid,"notes",id))); },
    watchEvents:function(pid, user, cb){
      var c=F.collection(db,"productions",pid,"events");
      var q=user.isAdmin?c:F.query(c,F.where("memberIds","array-contains",user.uid));
      return F.onSnapshot(q,function(s){ cb(docs(s).map(function(e){e.pid=pid;return e;})); },function(){});
    },
    watchPublicShows:function(cb){
      var q=F.query(F.collection(db,"publicShows"),F.where("kind","==","show"));
      return F.onSnapshot(q,function(s){cb(docs(s));},function(){});
    },
    syncPublicShows:function(prods){return wrap((async function(){
      var batch=F.writeBatch(db), count=0;
      for(var i=0;i<prods.length;i++){
        var p=prods[i], snap=await F.getDocs(F.collection(db,"productions",p.id,"events"));
        for(var j=0;j<snap.docs.length;j++){
          var x=snap.docs[j], e=x.data();
          if(e.kind==="show"){
            batch.set(F.doc(db,"publicShows",p.id+"_"+(e.id||x.id)),{id:e.id||x.id,pid:p.id,kind:"show",title:e.title,startsAt:e.startsAt,productionName:p.name,updatedAt:e.updatedAt||Date.now()}); count++;
            if(count>=400){await batch.commit();batch=F.writeBatch(db);count=0;}
          }
        }
      }
      if(count) await batch.commit();
    })());},
    saveEvent:function(pid,e){return wrap((async function(){
      var b=F.writeBatch(db), eventRef=F.doc(db,"productions",pid,"events",e.id), publicRef=F.doc(db,"publicShows",pid+"_"+e.id);
      var existingPublic=await F.getDoc(publicRef);
      b.set(eventRef,plain(e));
      if(e.kind==="show") b.set(publicRef,{id:e.id,pid:pid,kind:"show",title:e.title,startsAt:e.startsAt,productionName:e.productionName||"",updatedAt:e.updatedAt||Date.now()});
      else if(existingPublic.exists()) b.delete(publicRef);
      return b.commit();
    })());},
    deleteEvent:function(pid,id){ return wrap((async function(){
      var c=F.collection(db,"productions",pid,"events",id,"responses"), snap=await F.getDocs(c);
      await Promise.all(snap.docs.map(function(x){return F.deleteDoc(x.ref);}));
      var publicRef=F.doc(db,"publicShows",pid+"_"+id), existingPublic=await F.getDoc(publicRef);
      var b=F.writeBatch(db);b.delete(F.doc(db,"productions",pid,"events",id));if(existingPublic.exists())b.delete(publicRef);return b.commit();
    })()); },
    watchResponses:function(pid,eid,cb){ return F.onSnapshot(F.collection(db,"productions",pid,"events",eid,"responses"),function(s){ cb(docs(s)); },function(){}); },
    saveResponse:function(pid,eid,uid_,response){ return wrap(F.setDoc(F.doc(db,"productions",pid,"events",eid,"responses",uid_),{uid:uid_,response:response,updatedAt:Date.now()})); },
    watchScripts:function(pid,cb){ return F.onSnapshot(F.collection(db,"productions",pid,"scripts"),function(s){ cb(docs(s)); },function(){}); },
    watchHighlights:function(pid,sid,uid_,cb){
      var r=F.doc(db,"productions",pid,"scripts",sid,"highlights",uid_);
      return F.onSnapshot(r,function(s){var d=s.exists()?s.data():{};cb(d.highlights||[]);},function(){});
    },
    saveHighlights:function(pid,sid,uid_,highlights){
      return wrap(F.setDoc(F.doc(db,"productions",pid,"scripts",sid,"highlights",uid_),{uid:uid_,highlights:plain(highlights),updatedAt:Date.now()}));
    },
    saveScript:function(pid,s){ return wrap(F.setDoc(F.doc(db,"productions",pid,"scripts",s.id),plain(s))); },
    deleteScript:function(pid,id){ return wrap(F.deleteDoc(F.doc(db,"productions",pid,"scripts",id))); }
  };
}
window.ManaraDB = {makeDemo:makeDemo, makeFirebase:makeFirebase, cleanUsername:cleanUsername};
})();
