# هيكل جداول قاعدة البيانات (SheetDB / Google Sheets)

لا توجد قاعدة SQL في المشروع، فالتخزين في Google Sheets عبر SheetDB. أنشئ **جدول بيانات جديدًا** (لا تستخدم القديم المكشوف)
وأضف الأوراق (Sheets) التالية، **الصف الأول = أسماء الأعمدة بالإنجليزي كما هي بالضبط**:

| الورقة | الأعمدة |
|---|---|
| students | code, name, grade, class, phone |
| attendance | dkey, code, class, date, status, by |
| attendance_days | dkey, date, class, by |
| holidays | date, note |
| grades | gkey, code, term, period, subject, score, max, by, date |
| warnings | id, key, code, name, class, phone, abs_count, threshold, created, reason, status, approved_by, approved_at, read |
| settings | key, value |
| users | username, name, role, classes, salt, hash, active |

ملاحظات: `attendance` يخزّن **الغياب/التأخر/الغياب بعذر فقط** (الحاضر = غير مسجَّل). و`attendance_days` يسجّل أيام الدراسة الفعلية لكل فصل.
قيم status: absent | late | excused. حالة الإنذار: pending | approved | dismissed.
لا تضع بيانات يدويًا في `users` — أنشئ المدير عبر `/api/setup` كي تُخزَّن كلمة المرور مشفّرة.
