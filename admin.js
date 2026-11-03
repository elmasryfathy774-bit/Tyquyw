(function () {
"use strict";
var API = (window.HUDUR && window.HUDUR.API) || "";
var $ = function (i) { return document.getElementById(i); };
var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
var S = { token: null, user: null, settings: null, tab: "dash", students: null, memo: {} };
var PAGE = 25;
try { S.token = sessionStorage.getItem("hudur_t"); S.user = JSON.parse(sessionStorage.getItem("hudur_u") || "null"); } catch (e) {}

// ---------- أدوات ----------
function toast(m) { var t = $("toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove("show"); }, 3500); }
function dow(d) { return new Date(d + "T00:00:00Z").getUTCDay(); }
function addDays(d, n) { var t = new Date(d + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
function cairoToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date()); }
function monthEnd(m) { return addDays(addDays(m + "-28", 4).slice(0, 7) + "-01", -1); }
function fmt(n) { return n == null ? "—" : String(n); }
function debounce(f, ms) { var h; return function () { var a = arguments; clearTimeout(h); h = setTimeout(function () { f.apply(null, a); }, ms); }; }

async function api(path, o) {
  o = o || {};
  var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, o.timeout || 25000);
  try {
    var h = { "Content-Type": "application/json" };
    if (S.token) h.Authorization = "Bearer " + S.token;
    var r = await fetch(API + path, { method: o.method || "GET", headers: h, body: o.body ? JSON.stringify(o.body) : undefined, signal: ctl.signal });
    var j = {}; try { j = await r.json(); } catch (e) {}
    if (r.status === 401 && S.token) { logout("انتهت الجلسة، سجّل الدخول من جديد"); throw new Error("انتهت الجلسة"); }
    if (!r.ok) throw new Error(j.error || "حدث خطأ (" + r.status + ")");
    return j;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("انتهت مهلة الاتصال بالخادم، حاول مرة أخرى");
    if (e instanceof TypeError) throw new Error("تعذّر الوصول للخادم. تأكد من الإنترنت ومن رابط الـ Worker في config.js");
    throw e;
  } finally { clearTimeout(t); }
}
function report(from, to) {
  var k = (from || "") + "|" + (to || "");
  if (!S.memo[k]) S.memo[k] = api("/report" + (from ? "?from=" + from + "&to=" + to : "")).catch(function (e) { delete S.memo[k]; throw e; });
  return S.memo[k];
}
function dirty() { S.memo = {}; S.students = null; }
function loading(el) { el.innerHTML = '<div class="skel"></div><div class="skel" style="margin-top:10px"></div>'; }
function fail(el, e) { el.innerHTML = '<p class="note">' + esc(e.message) + '</p><button class="btn alt sm" onclick="location.reload()">إعادة المحاولة</button>'; }

// ---------- الدخول ----------
var busy = false;
function showLogin(msg) { $("shell").hidden = true; $("login").hidden = false; $("le").textContent = msg || ""; }
function logout(msg) { S.token = null; S.user = null; S.memo = {}; try { sessionStorage.clear(); } catch (e) {} showLogin(msg); }
$("lf").addEventListener("submit", async function (ev) {
  ev.preventDefault();
  if (busy) return;                                   // منع إرسال الطلب أكثر من مرة
  var u = $("lu").value.trim(), p = $("lp").value;
  if (!u || !p) { $("le").textContent = "اكتب اسم المستخدم وكلمة المرور"; return; }
  busy = true; $("lb").disabled = true; $("ls").hidden = false; $("lt").textContent = "جاري الدخول..."; $("le").textContent = "";
  try {
    var r = await api("/login", { method: "POST", body: { username: u, password: p }, timeout: 20000 });
    S.token = r.token; S.user = r.user;
    try { sessionStorage.setItem("hudur_t", r.token); sessionStorage.setItem("hudur_u", JSON.stringify(r.user)); } catch (e) {}
    $("lp").value = ""; boot();
  } catch (e) { $("le").textContent = e.message; }
  finally { busy = false; $("lb").disabled = false; $("ls").hidden = true; $("lt").textContent = "تسجيل الدخول"; }
});
$("out").onclick = function () { logout(); };
$("mx").onclick = function () { $("modal").hidden = true; };
$("modal").addEventListener("click", function (e) { if (e.target === $("modal")) $("modal").hidden = true; });

// ---------- التشغيل ----------
var TABS = [["dash", "لوحة التحكم"], ["students", "الطلاب"], ["attend", "تسجيل الحضور"], ["stats", "الإحصائيات والتقارير"], ["grades", "الدرجات"], ["warn", "الإنذارات"], ["settings", "الإعدادات", 1], ["users", "المستخدمون", 1]];
async function boot() {
  if (!API || /YOUR-ACCOUNT/.test(API)) { showLogin("لم يُضبط رابط الخادم في config.js بعد"); return; }
  if (!S.token) { showLogin(); return; }
  $("login").hidden = true; $("shell").hidden = false;
  $("who").textContent = S.user.name + " — " + (S.user.role === "admin" ? "مدير المدرسة" : "معلم");
  try { S.settings = await api("/settings"); } catch (e) { toast(e.message); return; }
  $("sname").textContent = S.settings.school_name || "حضور";
  var adm = S.user.role === "admin";
  $("tabs").innerHTML = TABS.filter(function (t) { return !t[2] || adm; }).map(function (t) { return '<a data-t="' + t[0] + '" role="button" tabindex="0">' + t[1] + "</a>"; }).join("");
  $("tabs").onclick = function (e) { var a = e.target.closest("a"); if (a) go(a.dataset.t); };
  go(S.tab);
}
function go(t) {
  S.tab = t;
  Array.prototype.forEach.call($("tabs").children, function (a) { a.classList.toggle("on", a.dataset.t === t); });
  var el = $("view"); loading(el);
  var V = { dash: vDash, students: vStudents, attend: vAttend, stats: vStats, grades: vGrades, warn: vWarn, settings: vSettings, users: vUsers };
  Promise.resolve(V[t](el)).catch(function (e) { fail(el, e); });
}

// ---------- لوحة التحكم ----------
function kpi(v, l, c) { return '<div class="kpi ' + (c || "") + '"><b>' + v + "</b><span>" + l + "</span></div>"; }
function barsChart(items) {
  var mx = Math.max.apply(null, items.map(function (i) { return i.v; }).concat([1]));
  return '<div class="bars">' + items.map(function (i) { return '<div class="bar"><em>' + i.v + '%</em><i style="height:' + Math.max(2, i.v / mx * 100) + '%"></i>' + esc(i.l) + "</div>"; }).join("") + "</div>";
}
async function vDash(el) {
  var r = await report();
  var t = r.todayStats, T = r.totals;
  var tot = Math.max(1, T.students);
  el.innerHTML = '<div class="kpis">' + kpi(T.students, "إجمالي الطلاب") + kpi(t.present, "حاضرون اليوم", "ok") + kpi(t.absent, "غائبون اليوم", t.absent ? "warn" : "") + kpi(t.late, "متأخرون اليوم") +
    kpi(T.presRate + "%", "نسبة الحضور (من بداية العام)", "ok") + kpi(T.absRate + "%", "نسبة الغياب (من بداية العام)", T.absRate > 10 ? "warn" : "") + kpi(r.warningsOpen, "إنذارات بانتظار الاعتماد", r.warningsOpen ? "warn" : "") + kpi(r.warningsTotal, "إجمالي الإنذارات الحالية") + "</div>" +
    (t.unrecorded ? '<p class="note">لم يُسجَّل حضور اليوم لعدد ' + t.unrecorded + ' طالب (فصول لم يُرصد حضورها بعد) — ولا تُحسب ضمن الحاضرين.</p>' : "") +
    '<div class="two"><div class="panel"><h3>حالة اليوم</h3><div class="bar-row" aria-hidden="true"><i style="width:' + t.present / tot * 100 + '%;background:var(--mint)"></i><i style="width:' + t.late / tot * 100 + '%;background:var(--gold)"></i><i style="width:' + t.absent / tot * 100 + '%;background:var(--bad)"></i></div><div class="lg"><span><s style="background:var(--mint)"></s>حاضر ' + t.present + '</span><span><s style="background:var(--gold)"></s>متأخر ' + t.late + '</span><span><s style="background:var(--bad)"></s>غائب ' + t.absent + '</span><span><s style="background:var(--soft)"></s>غير مسجّل ' + t.unrecorded + "</span></div></div>" +
    '<div class="panel"><h3>نسبة الغياب حسب الفصل (من بداية العام)</h3>' + (r.byClass.length ? r.byClass.map(function (c) { return '<div class="hb"><span>' + esc(c.class) + '</span><div><i style="width:' + Math.min(100, c.absRate * 4) + '%"></i></div><b>' + c.absRate + "%</b></div>"; }).join("") : '<p class="m">لا بيانات</p>') + "</div></div>" +
    '<div class="panel"><h3>مقارنة نسبة الغياب بين الشهور</h3>' + (r.monthly.some(function (m) { return m.days; }) ? barsChart(r.monthly.map(function (m) { return { l: m.month.slice(5) + "/" + m.month.slice(2, 4), v: m.absRate }; })) : '<p class="m">لا توجد أيام دراسة مسجلة بعد. ابدأ من «تسجيل الحضور».</p>') + "</div>" +
    '<div id="sp"></div>';
  studentsPanel($("sp"), r, true);
}

// ---------- الطلاب (جدول + بحث + تصفية + ملف) ----------
function vStudents(el) { return report().then(function (r) { el.innerHTML = '<div id="sp"></div>'; studentsPanel($("sp"), r, false); }); }
function studentsPanel(el, r, compact) {
  var F = { q: "", grade: "", cls: "", today: "", warn: "", page: 0 };
  var uniq = function (k) { var s = {}; r.rows.forEach(function (x) { if (x[k]) s[x[k]] = 1; }); return Object.keys(s).sort(); };
  var opt = function (a) { return '<option value="">الكل</option>' + a.map(function (x) { return "<option>" + esc(x) + "</option>"; }).join(""); };
  var adm = S.user.role === "admin";
  el.innerHTML = '<div class="panel"><h3>قائمة الطلاب (' + r.rows.length + ')</h3><div class="filters no-print">' +
    '<div><label for="fq">بحث بالاسم أو الرقم التعريفي</label><input id="fq" placeholder="اكتب للبحث" autocomplete="off"></div>' +
    '<div><label for="fg">الصف</label><select id="fg">' + opt(uniq("grade")) + '</select></div><div><label for="fcl">الفصل</label><select id="fcl">' + opt(uniq("class")) + "</select></div>" +
    '<div><label for="ft">حالة اليوم</label><select id="ft"><option value="">الكل</option><option value="present">حاضر</option><option value="absent">غائب</option><option value="late">متأخر</option><option value="unrecorded">غير مسجّل</option></select></div>' +
    '<div><label for="fw">الإنذار</label><select id="fw"><option value="">الكل</option><option value="any">عليه إنذار</option><option value="none">بدون إنذار</option></select></div></div>' +
    (adm ? '<div class="rowb no-print"><button class="btn alt sm" id="imp">استيراد طلاب من Excel / CSV</button></div>' : "") +
    '<div class="tw"><table class="t"><thead><tr><th>الاسم</th><th>الرقم التعريفي</th><th>الصف</th><th>الفصل</th><th>ولي الأمر / التواصل</th><th>أيام الحضور</th><th>أيام الغياب</th><th>نسبة الغياب</th><th>متوسط الدرجات</th><th>الإنذار</th><th>اليوم</th><th></th></tr></thead><tbody id="tb"></tbody></table></div><div class="pager" id="pg"></div></div>';
  function filtered() {
    var q = F.q.trim();
    return r.rows.filter(function (x) {
      return (!q || x.name.indexOf(q) > -1 || x.code.indexOf(q) > -1) && (!F.grade || x.grade === F.grade) && (!F.cls || x.class === F.cls) && (!F.today || x.today === F.today) &&
        (!F.warn || (F.warn === "any" ? !!x.warning : !x.warning));
    });
  }
  var TS = { present: ["حاضر", "g"], absent: ["غائب", "r"], late: ["متأخر", "y"], unrecorded: ["غير مسجّل", "m"] };
  function draw() {
    var f = filtered(), pages = Math.max(1, Math.ceil(f.length / PAGE)); if (F.page >= pages) F.page = pages - 1;
    var sl = f.slice(F.page * PAGE, F.page * PAGE + PAGE);
    $("tb").innerHTML = sl.length ? sl.map(function (x) {
      var w = x.warning ? (x.warning === "approved" ? '<span class="pill r">إنذار معتمد</span>' : '<span class="pill y">إنذار بانتظار الاعتماد</span>') : '<span class="pill g">لا</span>';
      return "<tr><td class=n>" + esc(x.name) + "</td><td dir=ltr>" + esc(x.code) + "</td><td>" + esc(x.grade || "—") + "</td><td>" + esc(x.class) + "</td><td>" + (x.phone ? '<a href="tel:' + esc(x.phone) + '" dir="ltr">' + esc(x.phone) + "</a>" : '<span class="pill m">بدون رقم</span>') + "</td><td>" + x.present + "</td><td>" + x.absent + "</td><td>" + x.absRate + "%</td><td>" + (x.avg == null ? "—" : x.avg + "% (" + esc(x.label) + ")") + "</td><td>" + w + '</td><td><span class="pill ' + TS[x.today][1] + '">' + TS[x.today][0] + '</span></td><td><button class="btn alt sm" data-c="' + esc(x.code) + '">فتح الملف</button></td></tr>';
    }).join("") : '<tr><td colspan="12" class="m">لا يوجد طلاب مطابقون</td></tr>';
    $("pg").innerHTML = '<button class="btn alt sm" id="pp"' + (F.page ? "" : " disabled") + '>السابق</button><span>صفحة ' + (F.page + 1) + " من " + pages + " (" + f.length + ' طالب)</span><button class="btn alt sm" id="pn"' + (F.page < pages - 1 ? "" : " disabled") + ">التالي</button>";
    $("pp").onclick = function () { F.page--; draw(); }; $("pn").onclick = function () { F.page++; draw(); };
  }
  var set = function (k) { return function () { F[k] = this.value; F.page = 0; draw(); }; };
  $("fq").oninput = debounce(function () { F.q = $("fq").value; F.page = 0; draw(); }, 200);
  $("fg").onchange = set("grade"); $("fcl").onchange = set("cls"); $("ft").onchange = set("today"); $("fw").onchange = set("warn");
  $("tb").onclick = function (e) { var b = e.target.closest("button[data-c]"); if (b) openStudent(b.dataset.c); };
  if ($("imp")) $("imp").onclick = importDialog;
  draw();
}
async function openStudent(code) {
  $("mb").innerHTML = '<div class="skel"></div>'; $("modal").hidden = false;
  try {
    var d = await api("/student/" + encodeURIComponent(code)), s = d.student;
    var ab = d.attendance.filter(function (a) { return a.status === "absent"; }).length;
    var ST = { absent: "غائب", late: "متأخر", excused: "غياب بعذر" };
    $("mb").innerHTML = '<h2 style="margin:0">' + esc(s.name) + '</h2><p class="m">الرقم التعريفي: <span dir=ltr>' + esc(s.code) + "</span> · الفصل: " + esc(s.class) + (s.grade ? " · الصف: " + esc(s.grade) : "") + " · ولي الأمر: " + esc(s.phone || "غير مسجل") + "</p>" +
      '<div class="kpis">' + kpi(ab, "أيام الغياب المسجلة") + kpi(d.attendance.filter(function (a) { return a.status === "late"; }).length, "مرات التأخر") + kpi(d.gradeSummary ? d.gradeSummary.avg + "% — " + esc(d.gradeSummary.label) : "—", "متوسط الدرجات") + "</div>" +
      '<div class="rowb"><button class="btn sm" id="sr">تحميل تقرير الطالب (Excel)</button><button class="btn alt sm" id="sp2">PDF / طباعة</button></div>' +
      '<div class="panel"><h3>الإنذارات (السجل الكامل)</h3>' + (d.warnings.length ? '<div class="tw"><table class="t"><tr><th>التاريخ</th><th>الأيام</th><th>السبب</th><th>الحالة</th><th>القراءة</th></tr>' + d.warnings.map(function (w) { return "<tr><td>" + esc(w.created) + "</td><td>" + esc(w.abs_count) + '</td><td class=n>' + esc(w.reason) + "</td><td>" + wl(w.status) + "</td><td>" + (w.read === "yes" ? "تمت قراءته" : "جديد") + "</td></tr>"; }).join("") + "</table></div>" : '<p class="m">لا توجد إنذارات</p>') + "</div>" +
      '<div class="panel"><h3>سجل الغياب والتأخر</h3>' + (d.attendance.length ? '<div class="tw" style="max-height:260px"><table class="t"><tr><th>التاريخ</th><th>الحالة</th></tr>' + d.attendance.map(function (a) { return "<tr><td>" + esc(a.date) + "</td><td>" + (ST[a.status] || esc(a.status)) + "</td></tr>"; }).join("") + "</table></div>" : '<p class="m">لا يوجد غياب مسجل</p>') + "</div>" +
      '<div class="panel"><h3>الدرجات</h3>' + (d.grades.length ? '<div class="tw"><table class="t"><tr><th>الفصل الدراسي</th><th>الفترة</th><th>المادة</th><th>الدرجة</th><th>من</th></tr>' + d.grades.map(function (g) { return "<tr><td>" + esc(g.term) + "</td><td>" + esc(g.period) + "</td><td>" + esc(g.subject) + "</td><td>" + esc(g.score) + "</td><td>" + esc(g.max) + "</td></tr>"; }).join("") + "</table></div>" : '<p class="m">لا توجد درجات</p>') + "</div>";
    var mk = function () { return studentReportData(d); };
    $("sr").onclick = function () { exportAs("xlsx", mk()); }; $("sp2").onclick = function () { exportAs("pdf", mk()); };
  } catch (e) { $("mb").innerHTML = '<p class="note">' + esc(e.message) + "</p>"; }
}
function wl(s) { return s === "approved" ? '<span class="pill r">معتمد</span>' : s === "dismissed" ? '<span class="pill m">ملغى</span>' : '<span class="pill y">بانتظار الاعتماد</span>'; }

// ---------- استيراد الطلاب ----------
function parseCSV(t) {
  t = t.replace(/^﻿/, ""); var rows = [], row = [], cur = "", q = false;
  for (var i = 0; i < t.length; i++) {
    var c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some(function (x) { return x.trim(); })) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(function (x) { return x.trim(); })) rows.push(row); return rows;
}
function mapStudents(rows) {
  var h = rows[0].map(function (x) { return String(x).trim(); }), idx = function (re) { return h.findIndex(function (x) { return re.test(x); }); };
  var ic = idx(/كود|رقم|code|id/i), inm = idx(/اسم|name/i), icl = idx(/فصل|class/i), ig = idx(/^الصف|grade/i), ip = idx(/تليفون|هاتف|موبايل|phone|mobile/i);
  if (ic < 0 || inm < 0 || icl < 0) throw new Error("لم أجد أعمدة: الكود، الاسم، الفصل في الصف الأول من الملف");
  return rows.slice(1).map(function (r) { return { code: String(r[ic] || "").trim(), name: String(r[inm] || "").trim(), class: String(r[icl] || "").trim(), grade: ig >= 0 ? String(r[ig] || "").trim() : "", phone: ip >= 0 ? String(r[ip] || "").trim() : "" }; }).filter(function (x) { return x.code && x.name; });
}
function loadScript(src) { return new Promise(function (res, rej) { if (window.XLSX) return res(); var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function () { rej(new Error("تعذّر تحميل مكتبة Excel، تأكد من الإنترنت")); }; document.head.appendChild(s); }); }
var XLSX_SRC = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
function importDialog() {
  $("mb").innerHTML = '<h2 style="margin:0">استيراد بيانات الطلاب</h2><p class="m">الأعمدة المطلوبة في الصف الأول: <b>الكود، الاسم، الفصل</b> (واختياري: الصف، تليفون ولي الأمر). الطالب الموجود (بنفس الكود) يتم تحديثه ولا يتكرر.</p><input type="file" id="fi" accept=".csv,.xlsx,.xls"><div id="ip"></div>';
  $("modal").hidden = false;
  $("fi").onchange = async function () {
    var f = this.files[0]; if (!f) return; var ip = $("ip"); ip.innerHTML = '<p class="m">جاري قراءة الملف...</p>';
    try {
      var rows;
      if (/\.csv$/i.test(f.name)) rows = parseCSV(await f.text());
      else { await loadScript(XLSX_SRC); var wb = XLSX.read(await f.arrayBuffer(), { type: "array" }); rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false }); }
      var data = mapStudents(rows), noPh = data.filter(function (x) { return !x.phone; }).length;
      ip.innerHTML = '<div class="panel"><b>' + data.length + ' طالب جاهز للاستيراد</b>' + (noPh ? '<p class="note">' + noPh + " طالب بدون رقم ولي أمر — لن يستطيع ولي أمرهم الدخول حتى يُسجَّل الرقم.</p>" : "") + '<button class="btn" id="go">تأكيد الاستيراد</button></div>';
      $("go").onclick = async function () {
        this.disabled = true; this.textContent = "جاري الاستيراد...";
        try { var a = 0, u = 0; for (var i = 0; i < data.length; i += 400) { var r = await api("/students/import", { method: "POST", body: { rows: data.slice(i, i + 400) }, timeout: 90000 }); a += r.added; u += r.updated; ip.innerHTML = '<p class="m">تمت معالجة ' + Math.min(i + 400, data.length) + " من " + data.length + "...</p>"; } dirty(); ip.innerHTML = '<p class="msg">تم: إضافة ' + a + " وتحديث " + u + " طالب.</p>"; go(S.tab); }
        catch (e) { ip.innerHTML = '<p class="note">' + esc(e.message) + "</p>"; }
      };
    } catch (e) { ip.innerHTML = '<p class="note">' + esc(e.message) + "</p>"; }
  };
}

// ---------- تسجيل الحضور ----------
async function classList() {
  if (!S.students) S.students = await api("/students");
  var s = {}; S.students.forEach(function (x) { s[x.class] = 1; }); return Object.keys(s).sort();
}
async function vAttend(el) {
  var cl = await classList(), today = cairoToday();
  el.innerHTML = '<div class="panel"><h3>تسجيل الحضور والغياب اليومي</h3><div class="inl"><div><label for="ad">اليوم</label><input type="date" id="ad" value="' + today + '" max="' + today + '"></div><div><label for="ac">الفصل</label><select id="ac">' + cl.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("") + '</select></div><button class="btn alt" id="al">عرض</button></div><div id="ar"></div></div>';
  async function load() {
    var d = $("ad").value, c = $("ac").value, ar = $("ar"); if (!d || !c) return; loading(ar);
    try {
      var res = await api("/attendance?date=" + d + "&class=" + encodeURIComponent(c)), m = {}; res.records.forEach(function (r) { m[r.code] = r.status; });
      var list = S.students.filter(function (s) { return s.class === c; });
      ar.innerHTML = (res.recorded ? '<p class="note">هذا اليوم مسجّل من قبل — الحفظ سيستبدل السجل.</p>' : '<p class="note">كل من لا تغيّر حالته يُحسب <b>حاضرًا</b>.</p>') + '<div class="rowb"><button class="btn alt sm" id="allp">الكل حاضر</button></div><div class="tw"><table class="t"><thead><tr><th>الاسم</th><th>الحالة</th></tr></thead><tbody>' + list.map(function (s) {
        var v = m[s.code] || "present";
        return "<tr><td class=n>" + esc(s.name) + '</td><td><span class="seg">' + [["present", "حاضر"], ["absent", "غائب"], ["late", "متأخر"], ["excused", "بعذر"]].map(function (o) { return '<label><input type="radio" name="s' + esc(s.code) + '" value="' + o[0] + '"' + (v === o[0] ? " checked" : "") + "><span>" + o[1] + "</span></label>"; }).join("") + "</span></td></tr>";
      }).join("") + '</tbody></table></div><div class="rowb"><button class="btn" id="asv">حفظ الحضور</button></div>';
      $("allp").onclick = function () { ar.querySelectorAll('input[value="present"]').forEach(function (i) { i.checked = true; }); };
      $("asv").onclick = async function () {
        var b = this; b.disabled = true; b.textContent = "جاري الحفظ...";
        var recs = []; list.forEach(function (s) { var ch = ar.querySelector('input[name="s' + s.code + '"]:checked'); if (ch && ch.value !== "present") recs.push({ code: s.code, status: ch.value }); });
        try { var r = await api("/attendance", { method: "POST", body: { date: d, class: c, records: recs }, timeout: 60000 }); dirty(); toast("تم الحفظ (" + recs.length + " غياب/تأخر)" + (r.newWarnings ? " — وتم إنشاء " + r.newWarnings + " إنذار جديد" : "")); b.textContent = "حفظ الحضور"; b.disabled = false; }
        catch (e) { toast(e.message); b.textContent = "حفظ الحضور"; b.disabled = false; }
      };
    } catch (e) { ar.innerHTML = '<p class="note">' + esc(e.message) + "</p>"; }
  }
  $("al").onclick = load; $("ac").onchange = load; $("ad").onchange = load; if (cl.length) load(); else $("ar").innerHTML = '<p class="note">لا يوجد طلاب بعد. استورد قائمة الطلاب من تبويب «الطلاب».</p>';
}

// ---------- الفترات ----------
function ranges(today) {
  var d = dow(today), ws = addDays(today, -d);
  return { thisWeek: [ws, today, "الأسبوع الحالي"], lastWeek: [addDays(ws, -7), addDays(ws, -1), "الأسبوع السابق"], last2w: [addDays(today, -13), today, "آخر أسبوعين"], lastMonth: [addDays(today, -29), today, "آخر شهر"] };
}
var KINDS = [["weekly", "تقرير الغياب الأسبوعي"], ["monthly", "تقرير الغياب الشهري"], ["last2w", "تقرير آخر أسبوعين"], ["custom", "تقرير فترة زمنية مخصصة"], ["general", "تقرير الغياب العام للمدرسة"], ["top", "تقرير الطلاب الأكثر غيابًا"], ["warnings", "تقرير الإنذارات"], ["student", "تقرير طالب محدد"]];
async function vStats(el) {
  var today = cairoToday(), R = ranges(today), cur = R.thisWeek;
  el.innerHTML = '<div class="panel"><h3>اختيار الفترة</h3><div class="rowb">' + Object.keys(R).map(function (k) { return '<button class="btn alt sm" data-r="' + k + '">' + R[k][2] + "</button>"; }).join("") + '</div><div class="inl"><div><label for="sm">شهر معيّن</label><input type="month" id="sm" max="' + today.slice(0, 7) + '"></div><div><label for="sf">من تاريخ</label><input type="date" id="sf" max="' + today + '"></div><div><label for="se">إلى تاريخ</label><input type="date" id="se" max="' + today + '"></div><button class="btn" id="sg">عرض</button></div></div><div id="so"></div>' +
    '<div class="panel no-print"><h3>تحميل التقرير</h3><div class="inl"><div><label for="rk">نوع التقرير</label><select id="rk">' + KINDS.map(function (k) { return '<option value="' + k[0] + '">' + k[1] + "</option>"; }).join("") + '</select></div><div id="rs" hidden><label for="rc">كود الطالب</label><input id="rc" dir="ltr"></div></div><p class="m">التقارير الأسبوعية/الشهرية/المخصصة تتبع الفترة المعروضة أعلاه. التقرير يحتوي على بيانات حقيقية من النظام.</p><div class="rowb"><button class="btn" id="d1">تحميل التقرير (Excel)</button><button class="btn alt" id="d2">CSV</button><button class="btn alt" id="d3">PDF / طباعة</button></div></div>';
  var label = cur[2];
  async function show(from, to, lab) {
    cur = [from, to, lab]; var o = $("so"); loading(o);
    try {
      var r = await report(from, to), T = r.totals, P = r.previous, dlt = Math.round((T.absRate - P.absRate) * 10) / 10;
      var top = r.rows.filter(function (x) { return x.absent > 0; }).sort(function (a, b) { return b.absent - a.absent; });
      o.innerHTML = '<p class="m">الفترة: ' + esc(lab) + " (" + from + " → " + to + ")</p>" + (T.totalAvail ? "" : '<p class="note">لا توجد أيام دراسة مسجلة في هذه الفترة.</p>') + '<div class="kpis">' + kpi(T.absentStudents, "طلاب تغيّبوا يومًا فأكثر", T.absentStudents ? "warn" : "") + kpi(T.totalAbsences, "إجمالي حالات الغياب") + kpi(top.filter(function (x) { return x.absent >= 3; }).length, "غابوا ٣ أيام أو أكثر") + kpi(T.absRate + "%", "نسبة الغياب", T.absRate > 10 ? "warn" : "") + kpi(T.presRate + "%", "نسبة الحضور", "ok") + kpi(r.topClass ? esc(r.topClass.class) : "—", "الفصل/الصف الأكثر غيابًا") + "</div>" +
        '<div class="panel"><h3>مقارنة بالفترة السابقة (' + P.from + " → " + P.to + ')</h3><p>نسبة الغياب الحالية <b>' + T.absRate + "%</b> مقابل <b>" + P.absRate + "%</b> — " + (dlt > 0 ? '<span class="pill r">زيادة ' + dlt + " نقطة</span>" : dlt < 0 ? '<span class="pill g">انخفاض ' + Math.abs(dlt) + " نقطة</span>" : '<span class="pill m">لا تغيير</span>') + " · إجمالي الغياب السابق: " + P.totalAbsences + "</p></div>" +
        '<div class="panel"><h3>الطلاب الأكثر غيابًا في الفترة</h3>' + (top.length ? '<div class="tw"><table class="t"><tr><th>#</th><th>الاسم</th><th>الصف</th><th>الفصل</th><th>أيام الغياب</th><th>نسبة الغياب</th></tr>' + top.slice(0, 20).map(function (x, i) { return "<tr><td>" + (i + 1) + "</td><td class=n>" + esc(x.name) + "</td><td>" + esc(x.grade || "—") + "</td><td>" + esc(x.class) + "</td><td>" + x.absent + "</td><td>" + x.absRate + "%</td></tr>"; }).join("") + "</table></div>" : '<p class="m">لا يوجد غياب في هذه الفترة</p>') + "</div>";
    } catch (e) { o.innerHTML = '<p class="note">' + esc(e.message) + "</p>"; }
  }
  el.querySelectorAll("[data-r]").forEach(function (b) { b.onclick = function () { var x = R[b.dataset.r]; show(x[0], x[1], x[2]); }; });
  $("sg").onclick = function () {
    var m = $("sm").value, f = $("sf").value, e = $("se").value;
    if (m) { var to = monthEnd(m); show(m + "-01", to > today ? today : to, "شهر " + m); }
    else if (f && e && f <= e) show(f, e > today ? today : e, "فترة مخصصة");
    else toast("اختر شهرًا، أو تاريخ البداية والنهاية بشكل صحيح");
  };
  $("rk").onchange = function () { $("rs").hidden = this.value !== "student"; };
  [["d1", "xlsx"], ["d2", "csv"], ["d3", "pdf"]].forEach(function (x) {
    $(x[0]).onclick = async function () {
      var w = x[1] === "pdf" ? window.open("", "_blank") : null;
      if (x[1] === "pdf" && !w) { toast("المتصفح منع النافذة المنبثقة. اسمح بها ثم أعد المحاولة"); return; }
      var b = this, old = b.textContent; b.disabled = true; b.textContent = "جاري التجهيز...";
      try { await exportAs(x[1], await buildReport($("rk").value, cur, $("rc").value.trim()), w); }
      catch (e) { if (w) w.close(); toast(e.message); }
      finally { b.disabled = false; b.textContent = old; }
    };
  });
  show(cur[0], cur[1], cur[2]);
}

// ---------- بناء التقارير والتصدير ----------
function meta(r, lab) { var T = r.totals; return [["اسم المدرسة", S.settings.school_name], ["الفترة الزمنية", lab + " (" + r.from + " إلى " + r.to + ")"], ["إجمالي الطلاب", T.students], ["عدد الطلاب الغائبين", T.absentStudents], ["إجمالي أيام الغياب", T.totalAbsences], ["نسبة الغياب", T.absRate + "%"]]; }
var ABS_H = ["اسم الطالب", "الرقم التعريفي", "الصف", "الفصل", "أيام الدراسة", "أيام الحضور", "أيام الغياب", "نسبة الغياب"];
var absRow = function (x) { return [x.name, x.code, x.grade, x.class, x.avail, x.present, x.absent, x.absRate + "%"]; };
async function buildReport(kind, cur, code) {
  var today = cairoToday(), R = ranges(today), lab, from, to;
  if (kind === "weekly") { from = R.thisWeek[0]; to = R.thisWeek[1]; lab = "الأسبوع الحالي"; }
  else if (kind === "last2w") { from = R.last2w[0]; to = R.last2w[1]; lab = "آخر أسبوعين"; }
  else if (kind === "monthly") { from = today.slice(0, 7) + "-01"; to = today; lab = "الشهر الحالي"; if (cur[2].indexOf("شهر ") === 0) { from = cur[0]; to = cur[1]; lab = cur[2]; } }
  else if (kind === "custom") { from = cur[0]; to = cur[1]; lab = cur[2]; }
  else if (kind === "warnings") {
    var ws = await api("/warnings"), st = { approved: "معتمد", pending: "بانتظار الاعتماد", dismissed: "ملغى" };
    return { title: "تقرير الإنذارات", meta: [["اسم المدرسة", S.settings.school_name], ["حد الإنذار", S.settings.absence_threshold + " يوم"], ["عدد الإنذارات", ws.length]], headers: ["اسم الطالب", "الرقم التعريفي", "الفصل", "أيام الغياب", "تاريخ الإنذار", "السبب", "الحالة", "قراءة ولي الأمر"], rows: ws.map(function (w) { return [w.name, w.code, w.class, w.abs_count, w.created, w.reason, st[w.status] || w.status, w.read === "yes" ? "تمت قراءته" : "جديد"]; }) };
  }
  else if (kind === "student") {
    if (!code) throw new Error("اكتب كود الطالب أولًا");
    return studentReportData(await api("/student/" + encodeURIComponent(code)));
  }
  var r;
  if (kind === "general") { r = await report(); lab = "من بداية العام الدراسي"; return { title: "تقرير الغياب العام للمدرسة", meta: meta(r, lab), headers: ABS_H, rows: r.rows.filter(function (x) { return x.absent > 0; }).sort(function (a, b) { return b.absent - a.absent; }).map(absRow) }; }
  if (kind === "top") { r = await report(); lab = "من بداية العام الدراسي"; return { title: "تقرير الطلاب الأكثر غيابًا", meta: meta(r, lab), headers: ["الترتيب"].concat(ABS_H), rows: r.rows.filter(function (x) { return x.absent > 0; }).sort(function (a, b) { return b.absent - a.absent; }).slice(0, 30).map(function (x, i) { return [i + 1].concat(absRow(x)); }) }; }
  r = await report(from, to);
  return { title: KINDS.filter(function (k) { return k[0] === kind; })[0][1], meta: meta(r, lab), headers: ABS_H, rows: r.rows.filter(function (x) { return x.absent > 0; }).sort(function (a, b) { return b.absent - a.absent; }).map(absRow) };
}
function studentReportData(d) {
  var s = d.student, ab = d.attendance.filter(function (a) { return a.status === "absent"; }), ST = { absent: "غائب", late: "متأخر", excused: "غياب بعذر" };
  var rows = d.attendance.map(function (a) { return ["حضور", a.date, ST[a.status] || a.status, ""]; }).concat(d.grades.map(function (g) { return ["درجة", g.term + " / " + g.period, g.subject, g.score + " من " + g.max]; })).concat(d.warnings.map(function (w) { return ["إنذار", w.created, w.reason, w.status === "approved" ? "معتمد" : w.status === "dismissed" ? "ملغى" : "بانتظار الاعتماد"]; }));
  return { title: "تقرير الطالب: " + s.name, meta: [["اسم المدرسة", S.settings.school_name], ["الطالب", s.name], ["الرقم التعريفي", s.code], ["الفصل", s.class], ["أيام الغياب", ab.length], ["متوسط الدرجات", d.gradeSummary ? d.gradeSummary.avg + "% — " + d.gradeSummary.label : "—"]], headers: ["النوع", "التاريخ / الفترة", "التفاصيل", "ملاحظات"], rows: rows };
}
function safeCell(v) { v = v == null ? "" : String(v); return /^[=+\-@\t\r]/.test(v) && isNaN(v) ? "'" + v : v; }
function dl(blob, name) { var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }
async function exportAs(fmt, rep, win) {
  var name = "hudur-" + cairoToday();
  var all = rep.meta.map(function (m) { return [m[0], m[1]]; }).concat([[]], [rep.headers], rep.rows);
  if (fmt === "csv") { var csv = "﻿" + all.map(function (r) { return r.map(function (c) { return '"' + safeCell(c).replace(/"/g, '""') + '"'; }).join(","); }).join("\r\n"); dl(new Blob([csv], { type: "text/csv;charset=utf-8" }), name + ".csv"); }
  else if (fmt === "xlsx") {
    await loadScript(XLSX_SRC);
    var ws = XLSX.utils.aoa_to_sheet([[rep.title]].concat([[]], all.map(function (r) { return r.map(safeCell); })));
    ws["!views"] = [{ RTL: true }]; ws["!cols"] = rep.headers.map(function () { return { wch: 22 }; });
    var wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] }; XLSX.utils.book_append_sheet(wb, ws, "التقرير"); XLSX.writeFile(wb, name + ".xlsx");
  } else {
    var w = win || window.open("", "_blank"); if (!w) throw new Error("المتصفح منع النافذة المنبثقة");
    w.document.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>' + esc(rep.title) + '</title><style>body{font-family:Cairo,Tahoma,Arial;padding:16px}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border:1px solid #999;padding:5px 8px;text-align:right}th{background:#eee}h1{font-size:20px}.m td{border:0;padding:2px 6px}</style></head><body><h1>' + esc(rep.title) + '</h1><table class="m">' + rep.meta.map(function (m) { return "<tr><td><b>" + esc(m[0]) + "</b></td><td>" + esc(m[1]) + "</td></tr>"; }).join("") + "</table><br><table><tr>" + rep.headers.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") + "</tr>" + rep.rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") + "</table><p>للحفظ كملف PDF اختر «حفظ بصيغة PDF» من نافذة الطباعة.</p></body></html>");
    w.document.close(); w.focus(); setTimeout(function () { w.print(); }, 400);
  }
}

// ---------- الدرجات ----------
async function vGrades(el) {
  var cl = await classList(), subs = S.settings.subjects || [];
  el.innerHTML = '<div class="panel"><h3>إدخال الدرجات</h3><div class="inl"><div><label for="gc">الفصل</label><select id="gc">' + cl.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("") + '</select></div><div><label for="gt">الفصل الدراسي</label><select id="gt"><option>الأول</option><option>الثاني</option></select></div><div><label for="gp">الشهر / الفترة</label><input id="gp" placeholder="مثال: أكتوبر"></div><div><label for="gs">المادة</label><input id="gs" list="gl" placeholder="اسم المادة"><datalist id="gl">' + subs.map(function (s) { return '<option value="' + esc(s.name) + '">'; }).join("") + '</datalist></div><div><label for="gm">الدرجة النهائية</label><input id="gm" type="number" min="1" value="' + (subs[0] ? subs[0].max : 50) + '"></div><button class="btn alt" id="gl2">عرض الطلاب</button></div><div id="go"></div></div><div class="panel"><h3>تقرير الدرجات (الفصل / المدرسة)</h3><div class="inl"><div><label for="rt">الفصل الدراسي</label><select id="rt"><option value="">كل الفصول الدراسية</option><option>الأول</option><option>الثاني</option></select></div><div><label for="rc2">الفصل</label><select id="rc2"><option value="">كل المدرسة</option>' + cl.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("") + '</select></div><button class="btn" id="rb">عرض التقرير</button></div><div id="gr"></div></div>';
  $("gs").onchange = function () { var s = subs.filter(function (x) { return x.name === $("gs").value; })[0]; if (s) $("gm").value = s.max; };
  $("gl2").onclick = async function () {
    var c = $("gc").value, g = $("go"); if (!c) return; loading(g);
    try {
      var res = await api("/grades?class=" + encodeURIComponent(c) + "&term=" + encodeURIComponent($("gt").value)), sub = $("gs").value.trim(), per = $("gp").value.trim(), ex = {};
      res.grades.forEach(function (x) { if (x.subject === sub && x.period === per) ex[x.code] = x.score; });
      g.innerHTML = '<div class="tw"><table class="t"><tr><th>الاسم</th><th>الدرجة (من ' + esc($("gm").value) + ')</th></tr>' + res.students.map(function (s) { return "<tr><td class=n>" + esc(s.name) + '</td><td><input type="number" step="0.25" min="0" data-c="' + esc(s.code) + '" value="' + (ex[s.code] == null ? "" : esc(ex[s.code])) + '" style="margin:0;width:110px"></td></tr>'; }).join("") + '</table></div><div class="rowb"><button class="btn" id="gsv">حفظ الدرجات</button></div>';
      $("gsv").onclick = async function () {
        var term = $("gt").value, mx = +$("gm").value, b = this;
        if (!sub || !per || !(mx > 0)) { toast("اكتب المادة والفترة والدرجة النهائية"); return; }
        var recs = []; g.querySelectorAll("input[data-c]").forEach(function (i) { if (i.value !== "") recs.push({ code: i.dataset.c, score: i.value }); });
        b.disabled = true; b.textContent = "جاري الحفظ...";
        try { var r = await api("/grades", { method: "POST", body: { term: term, period: per, subject: sub, max: mx, records: recs }, timeout: 90000 }); dirty(); toast("تم حفظ " + r.saved + " درجة"); }
        catch (e) { toast(e.message); } finally { b.disabled = false; b.textContent = "حفظ الدرجات"; }
      };
    } catch (e) { g.innerHTML = '<p class="note">' + esc(e.message) + "</p>"; }
  };
  $("rb").onclick = async function () {
    var o = $("gr"); loading(o);
    try {
      var q = "?term=" + encodeURIComponent($("rt").value) + "&class=" + encodeURIComponent($("rc2").value), res = await api("/grades" + q), by = {}, per = {};
      var smap = {}; subs.forEach(function (s) { smap[s.name] = s; });
      res.grades.forEach(function (g) { var k = g.term + " / " + g.period; per[k] = 1; var p = ((by[g.code] = by[g.code] || {})[k] = by[g.code][k] || {}); (p[g.subject] = p[g.subject] || []).push(+g.score / +g.max * 100); });
      var ks = Object.keys(per).sort();
      var avg = function (o2) { var n = 0, d = 0; for (var s in o2) { var v = o2[s].reduce(function (a, b) { return a + b; }, 0) / o2[s].length, w = smap[s] && +smap[s].weight > 0 ? +smap[s].weight : 1; n += v * w; d += w; } return d ? Math.round(n / d * 10) / 10 : null; };
      var rows = res.students.map(function (s) { var per2 = ks.map(function (k) { return by[s.code] && by[s.code][k] ? avg(by[s.code][k]) : null; }), vals = per2.filter(function (v) { return v != null; }); return { s: s, per: per2, all: vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length * 10) / 10 : null }; });
      var cs = {}; rows.forEach(function (r) { if (r.all != null) { (cs[r.s.class] = cs[r.s.class] || []).push(r.all); } });
      var scale = S.settings.grade_scale, lab = function (v) { if (v == null) return "—"; for (var i = 0; i < scale.length; i++) if (v >= scale[i][1]) return scale[i][0]; return "—"; };
      var mean = function (a) { return Math.round(a.reduce(function (x, y) { return x + y; }, 0) / a.length * 10) / 10; };
      var all = rows.filter(function (r) { return r.all != null; }).map(function (r) { return r.all; });
      o.innerHTML = '<p class="m">متوسط المدرسة: <b>' + (all.length ? mean(all) + "%" : "—") + "</b> — " + Object.keys(cs).map(function (c) { return esc(c) + ": " + mean(cs[c]) + "%"; }).join(" · ") + '</p><div class="tw"><table class="t"><tr><th>الاسم</th><th>الفصل</th>' + ks.map(function (k) { return "<th>" + esc(k) + "</th>"; }).join("") + "<th>المتوسط</th><th>التقدير</th></tr>" + rows.map(function (r) { return "<tr><td class=n>" + esc(r.s.name) + "</td><td>" + esc(r.s.class) + "</td>" + r.per.map(function (v) { return "<td>" + (v == null ? "—" : v + "%") + "</td>"; }).join("") + "<td>" + (r.all == null ? "—" : r.all + "%") + "</td><td>" + lab(r.all) + "</td></tr>"; }).join("") + "</table></div>" + (ks.length ? "" : '<p class="m">لا توجد درجات مسجلة بعد.</p>') + '<div class="rowb"><button class="btn alt sm" id="gx">تحميل Excel</button><button class="btn alt sm" id="gp2">PDF / طباعة</button></div>';
      var rep = { title: "تقرير الدرجات", meta: [["اسم المدرسة", S.settings.school_name], ["الفصل الدراسي", $("rt").value || "الكل"], ["متوسط المدرسة", all.length ? mean(all) + "%" : "—"]], headers: ["الاسم", "الفصل"].concat(ks, ["المتوسط", "التقدير"]), rows: rows.map(function (r) { return [r.s.name, r.s.class].concat(r.per.map(function (v) { return v == null ? "" : v + "%"; }), [r.all == null ? "" : r.all + "%", lab(r.all)]); }) };
      $("gx").onclick = function () { exportAs("xlsx", rep).catch(function (e) { toast(e.message); }); }; $("gp2").onclick = function () { exportAs("pdf", rep).catch(function (e) { toast(e.message); }); };
    } catch (e) { o.innerHTML = '<p class="note">' + esc(e.message) + "</p>"; }
  };
}

// ---------- الإنذارات ----------
async function vWarn(el) {
  var ws = await api("/warnings"), adm = S.user.role === "admin", th = S.settings.absence_threshold;
  el.innerHTML = '<div class="panel"><h3>الإنذارات والطلاب الذين يحتاجون متابعة</h3><p class="m">يُنشأ الإنذار تلقائيًا عند بلوغ ' + th + ' يوم غياب (قابل للتعديل من الإعدادات). الإنذار <b>غير رسمي</b> حتى تعتمده الإدارة.</p>' + (adm ? '<div class="rowb"><button class="btn alt sm" id="wr">فحص الطلاب وإنشاء الإنذارات المستحقة الآن</button></div>' : "") + (ws.length ? '<div class="tw"><table class="t"><tr><th>الطالب</th><th>الفصل</th><th>أيام الغياب</th><th>التاريخ</th><th>السبب</th><th>الحالة</th><th>ولي الأمر</th>' + (adm ? "<th>إجراء</th>" : "") + "</tr>" + ws.map(function (w) {
    var msg = "السلام عليكم، نفيدكم بأن عدد أيام غياب الطالبة " + w.name + " بلغ " + w.abs_count + " يوم، برجاء المتابعة والتواصل مع إدارة المدرسة.", ph = String(w.phone || "").replace(/^0/, "20");
    return "<tr><td class=n>" + esc(w.name) + "</td><td>" + esc(w.class) + "</td><td>" + esc(w.abs_count) + "</td><td>" + esc(w.created) + "</td><td class=n>" + esc(w.reason) + "</td><td>" + wl(w.status) + (w.read === "yes" ? ' <span class="pill g">قرأه ولي الأمر</span>' : "") + "</td><td>" + (ph ? '<a class="btn alt sm" target="_blank" rel="noopener" href="https://wa.me/' + esc(ph) + "?text=" + encodeURIComponent(msg) + '">واتساب</a>' : "بدون رقم") + "</td>" + (adm ? '<td><button class="btn sm" data-a="approved" data-i="' + esc(w.id) + '">اعتماد</button> <button class="btn alt sm" data-a="dismissed" data-i="' + esc(w.id) + '">إلغاء</button></td>' : "") + "</tr>";
  }).join("") + "</table></div>" : '<p class="m">لا توجد إنذارات حالية</p>') + "</div>";
  if (adm) {
    $("wr").onclick = async function () { this.disabled = true; try { var r = await api("/warnings/run", { method: "POST", body: {}, timeout: 60000 }); toast("تم إنشاء " + r.created + " إنذار جديد"); dirty(); go("warn"); } catch (e) { toast(e.message); this.disabled = false; } };
    el.onclick = async function (e) { var b = e.target.closest("button[data-a]"); if (!b) return; b.disabled = true; try { await api("/warnings/" + encodeURIComponent(b.dataset.i), { method: "PATCH", body: { status: b.dataset.a } }); dirty(); go("warn"); } catch (x) { toast(x.message); b.disabled = false; } };
  }
}

// ---------- الإعدادات ----------
async function vSettings(el) {
  var s = S.settings, hol = await api("/holidays"), wk = [[6, "السبت"], [0, "الأحد"], [1, "الإثنين"], [2, "الثلاثاء"], [3, "الأربعاء"], [4, "الخميس"], [5, "الجمعة"]];
  var subj = function (x) { return '<div class="inl subr"><input class="sn" placeholder="المادة" value="' + esc(x.name) + '"><input class="sm2" type="number" placeholder="الدرجة النهائية" value="' + esc(x.max) + '"><input class="sw" type="number" step="0.5" placeholder="الوزن" value="' + esc(x.weight) + '"></div>'; };
  var scl = function (x) { return '<div class="inl scr"><input class="gn" placeholder="التقدير" value="' + esc(x[0]) + '"><input class="gm2" type="number" placeholder="الحد الأدنى %" value="' + esc(x[1]) + '"></div>'; };
  el.innerHTML = '<div class="panel"><h3>إعدادات المدرسة</h3><label for="s1">اسم المدرسة (يظهر في التقارير)</label><input id="s1" value="' + esc(s.school_name) + '"><label for="s2">عدد أيام الغياب لإصدار الإنذار</label><input id="s2" type="number" min="1" value="' + esc(s.absence_threshold) + '"><label for="s3">بداية العام الدراسي (اختياري — الافتراضي 1 سبتمبر)</label><input id="s3" type="date" value="' + esc(s.year_start) + '"><label for="s4">ظهور الإنذار لولي الأمر</label><select id="s4"><option value="on_create"' + (s.notify_mode === "on_create" ? " selected" : "") + '>فور إنشائه (كتنبيه مبدئي)</option><option value="on_approval"' + (s.notify_mode === "on_approval" ? " selected" : "") + '>بعد اعتماد الإدارة فقط</option></select><label>أيام الإجازة الأسبوعية</label><div class="inl">' + wk.map(function (d) { return '<label><input type="checkbox" class="wd" value="' + d[0] + '"' + (s.weekend.map(Number).indexOf(d[0]) > -1 ? " checked" : "") + ' style="width:auto"> ' + d[1] + "</label>"; }).join("") + "</div></div>" +
    '<div class="panel"><h3>المواد الدراسية (الدرجة النهائية والوزن النسبي)</h3><div id="sj">' + (s.subjects.length ? s.subjects : [{ name: "", max: 50, weight: 1 }]).map(subj).join("") + '</div><button class="btn alt sm" id="sa">+ مادة</button><p class="m">المتوسط = مجموع (نسبة الطالب في المادة × وزنها) ÷ مجموع الأوزان. لا يتأثر بالحضور إطلاقًا.</p></div>' +
    '<div class="panel"><h3>مقياس التقدير</h3><div id="sc">' + s.grade_scale.map(scl).join("") + '</div><button class="btn alt sm" id="sb">+ تقدير</button></div><div class="rowb"><button class="btn" id="ssv">حفظ الإعدادات</button></div>' +
    '<div class="panel"><h3>الإجازات والعطلات (تُستبعد من حساب أيام الدراسة)</h3><div class="inl"><input type="date" id="hd"><input id="hn" placeholder="الوصف (اختياري)"><button class="btn alt sm" id="ha">إضافة</button></div>' + (hol.length ? '<div class="tw" style="margin-top:8px"><table class="t"><tr><th>التاريخ</th><th>الوصف</th><th></th></tr>' + hol.sort(function (a, b) { return a.date < b.date ? 1 : -1; }).map(function (h) { return "<tr><td>" + esc(h.date) + "</td><td>" + esc(h.note) + '</td><td><button class="btn alt sm" data-h="' + esc(h.date) + '">حذف</button></td></tr>'; }).join("") + "</table></div>" : '<p class="m">لا توجد عطلات مسجلة</p>') + "</div>";
  $("sa").onclick = function () { $("sj").insertAdjacentHTML("beforeend", subj({ name: "", max: 50, weight: 1 })); };
  $("sb").onclick = function () { $("sc").insertAdjacentHTML("beforeend", scl(["", 0])); };
  $("ssv").onclick = async function () {
    var b = this, subs = [].map.call(el.querySelectorAll(".subr"), function (r) { return { name: r.querySelector(".sn").value.trim(), max: +r.querySelector(".sm2").value, weight: +r.querySelector(".sw").value || 1 }; }).filter(function (x) { return x.name && x.max > 0; });
    var sc = [].map.call(el.querySelectorAll(".scr"), function (r) { return [r.querySelector(".gn").value.trim(), +r.querySelector(".gm2").value]; }).filter(function (x) { return x[0]; }).sort(function (a, b2) { return b2[1] - a[1]; });
    if (!sc.length || sc[sc.length - 1][1] > 0) { toast("يجب أن يحتوي المقياس على تقدير حدّه الأدنى 0"); return; }
    var th = Math.floor(+$("s2").value); if (!(th >= 1)) { toast("حد الإنذار رقم صحيح 1 أو أكثر"); return; }
    b.disabled = true;
    try { S.settings = await api("/settings", { method: "PUT", body: { school_name: $("s1").value.trim(), absence_threshold: th, year_start: $("s3").value, notify_mode: $("s4").value, weekend: [].map.call(el.querySelectorAll(".wd:checked"), function (c) { return +c.value; }), subjects: subs, grade_scale: sc } }); dirty(); $("sname").textContent = S.settings.school_name; toast("تم حفظ الإعدادات"); }
    catch (e) { toast(e.message); } finally { b.disabled = false; }
  };
  $("ha").onclick = async function () { var d = $("hd").value; if (!d) return; try { await api("/holidays", { method: "POST", body: { date: d, note: $("hn").value } }); dirty(); go("settings"); } catch (e) { toast(e.message); } };
  el.querySelectorAll("button[data-h]").forEach(function (b) { b.onclick = async function () { try { await api("/holidays?date=" + b.dataset.h, { method: "DELETE" }); dirty(); go("settings"); } catch (e) { toast(e.message); } }; });
}

// ---------- المستخدمون ----------
async function vUsers(el) {
  var us = await api("/users"), cl = await classList();
  el.innerHTML = '<div class="panel"><h3>إضافة معلم / مدير</h3><div class="inl"><input id="un" placeholder="الاسم الكامل"><input id="uu" dir="ltr" placeholder="اسم المستخدم (إنجليزي)"><input id="up" type="password" dir="ltr" placeholder="كلمة مرور (8 أحرف+)" autocomplete="new-password"><select id="ur"><option value="teacher">معلم</option><option value="admin">مدير</option></select></div><label>الفصول المسموحة للمعلم</label><div class="inl">' + cl.map(function (c) { return '<label><input type="checkbox" class="uc" value="' + esc(c) + '" style="width:auto"> ' + esc(c) + "</label>"; }).join("") + '</div><div class="rowb"><button class="btn" id="ua">إنشاء الحساب</button></div></div><div class="panel"><h3>الحسابات</h3><div class="tw"><table class="t"><tr><th>الاسم</th><th>المستخدم</th><th>الدور</th><th>الفصول</th><th>الحالة</th><th></th></tr>' + us.map(function (u) { return "<tr><td>" + esc(u.name) + "</td><td dir=ltr>" + esc(u.username) + "</td><td>" + (u.role === "admin" ? "مدير" : "معلم") + "</td><td>" + esc(u.classes || "—") + "</td><td>" + (u.active === "no" ? "معطّل" : "نشط") + "</td><td>" + (u.active !== "no" && u.username !== S.user.u ? '<button class="btn alt sm" data-u="' + esc(u.username) + '">تعطيل</button>' : "") + "</td></tr>"; }).join("") + "</table></div></div>";
  $("ua").onclick = async function () {
    var b = this; b.disabled = true;
    try { await api("/users", { method: "POST", body: { name: $("un").value, username: $("uu").value, password: $("up").value, role: $("ur").value, classes: [].map.call(el.querySelectorAll(".uc:checked"), function (c) { return c.value; }).join(",") } }); toast("تم إنشاء الحساب"); go("users"); }
    catch (e) { toast(e.message); b.disabled = false; }
  };
  el.querySelectorAll("button[data-u]").forEach(function (b) { b.onclick = async function () { if (!confirm("تعطيل هذا الحساب؟")) return; try { await api("/users/" + encodeURIComponent(b.dataset.u), { method: "DELETE" }); go("users"); } catch (e) { toast(e.message); } }; });
}

window.addEventListener("error", function () { toast("حدث خطأ غير متوقع، أعد تحميل الصفحة"); });
window.addEventListener("unhandledrejection", function (e) { if (e.reason && e.reason.message) toast(e.reason.message); });
boot();
})();
