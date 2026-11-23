# سجلها علي - رفع على Render (خطوات دقيقة)

## الخطوة 1: إنشاء حساب ورفع الكود

1. اذهب إلى [GitHub](https://github.com) وأنشئ مستودعاً جديداً (Public أو Private).
2. ارفع مجلد `debt-app` بالكامل إلى المستودع (يمكنك استخدام GitHub Desktop أو رفع الملفات يدوياً).

أو استخدم هذا الأمر إذا كان لديك Git مثبت:
```bash
cd debt-app
git init
git add .
git commit -m "سجلها علي - جاهز للرفع"
git branch -M main
git remote add origin https://github.com/اسمك/sejelha-alay.git
git push -u origin main
```

## الخطوة 2: إنشاء الخدمة على Render

1. اذهب إلى [Render.com](https://render.com) وسجل دخول (يمكن بـ GitHub).
2. اضغط **New +** → **Web Service**.
3. اختر المستودع الذي رفعته (`sejelha-alay`).
4. املأ البيانات كالتالي:

| الحقل              | القيمة                          |
|--------------------|---------------------------------|
| Name               | sejelha-alay                    |
| Runtime            | Node                            |
| Build Command      | `echo "No build needed"`        |
| Start Command      | `node server.js`                |
| Instance Type      | Free                            |

5. اضغط **Create Web Service**.

## الخطوة 3: انتظار البناء

- انتظر حتى يظهر "Live" (عادة 1-3 دقائق).
- سيُعطيك Render رابطاً مثل:  
  `https://sejelha-alay.onrender.com`

## بيانات الدخول

- موظف: `oxy` / `200767@`
- صاحب المحل: `admin` / `200200`

## ملاحظات مهمة

- الخدمة المجانية على Render تنام بعد 15 دقيقة من عدم الاستخدام، وتستيقظ تلقائياً عند أول زيارة (قد تتأخر 30-50 ثانية).
- قاعدة البيانات (`database.json`) تُحفظ داخل الخدمة، لكنها تُمسح إذا أعدت النشر من الصفر. للبيانات الدائمة يُفضل لاحقاً ربط قاعدة بيانات خارجية.
- التطبيق جاهز تماماً ولا يحتاج أي تعديل إضافي.

بعد الانتهاء أرسل لي الرابط لأتحقق منه إذا أردت.
