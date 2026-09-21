# פריסה לענן — Render (שלב 6)

הקוד כבר מוכן לפריסה (Procfile, requirements.txt מעודכן, תמיכה ב-DATABASE_URL
ו-SECRET_KEY דרך משתני סביבה). הצעדים הבאים הם בצד שלך.

## שלב 1 — GitHub

אם אין לך חשבון: הירשם בחינם ב-https://github.com

צור repository חדש וריק:
1. לחץ על "+" למעלה מימין → "New repository"
2. שם: `hubble-cloud` (או כל שם אחר)
3. השאר "Private" אם אתה רוצה שהקוד יישאר פרטי
4. **אל תסמן** "Add a README file" — תיצור repo ריק לגמרי
5. לחץ "Create repository"

## שלב 2 — העלאת הקוד

בטרמינל, בתוך תיקיית `hubble-cloud` (זו שמכילה את `app.py`):

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/USERNAME/hubble-cloud.git
git push -u origin main
```

**שים לב:** תחליף `USERNAME` בשם המשתמש שלך ב-GitHub, ו-`hubble-cloud` בשם
שנתת ל-repo אם בחרת שם אחר. GitHub יראה לך את הכתובת המדויקת בעמוד שנפתח
אחרי יצירת ה-repo (תחת "…or push an existing repository from the command
line").

בפעם הראשונה שתריץ `git push`, ייתכן שתתבקש להתחבר — GitHub לא מקבל יותר
סיסמה רגילה בשורת הפקודה; אם תתבקש, עקוב אחרי ההוראות שלהם ליצירת "Personal
Access Token" (זה תהליך של דקה, מוסבר בעמוד עצמו).

## שלב 3 — Render

הירשם בחינם ב-https://render.com, ולחץ "Connect GitHub" כדי לחבר את
החשבון (הרשאה חד-פעמית).

### 3א — מסד הנתונים (PostgreSQL)

1. בדשבורד של Render: "New +" → "PostgreSQL"
2. שם: `hubble-db` (או כל שם)
3. Plan: **Free**
4. לחץ "Create Database"
5. אחרי שהוא נוצר, גלול לשדה **"Internal Database URL"** והעתק אותו —
   תצטרך אותו בשלב הבא

### 3ב — ה-Web Service

1. "New +" → "Web Service"
2. בחר את ה-repo `hubble-cloud` שיצרת
3. Runtime: Python 3
4. Build Command: `pip install -r requirements.txt`
5. Start Command: (משאירים ריק — Render קורא את זה אוטומטית מה-`Procfile`)
6. Plan: **Free**
7. לפני שלוחצים Create, גלול ל-"Environment Variables" והוסף:
   - `DATABASE_URL` = (מה שהעתקת משלב 3א)
   - `SECRET_KEY` = כל מחרוזת אקראית (למשל `hubble-secret-2026-xyz`)
8. לחץ "Create Web Service"

Render יתחיל לבנות ולפרוס — זה לוקח כמה דקות בפעם הראשונה. בסיום תקבל
כתובת ציבורית כמו `https://hubble-cloud.onrender.com`.

## שלב 4 — בדיקה

פתח את הכתובת, צור כרטיס, פתח האב, ונסה מהטלפון/מחשב נוסף (לא צריך
להיות על אותה רשת WiFi יותר — זה כל הכיף בענן).

## עדכון עתידי

כשאני אתקן באג או אוסיף פיצ'ר, פשוט תריץ שוב בתיקייה שלך:

```bash
git add .
git commit -m "עדכון"
git push
```

Render יבחין בעדכון ויפרוס אותו אוטומטית תוך דקה־שתיים.

## תזכורות

- השרת החינמי "נרדם" אחרי 15 דקות ללא תנועה — הבקשה הראשונה אחרי זה
  לוקחת כ-30-60 שניות. כדאי "להעיר" אותו יום לפני דמו חשוב (סתם לפתוח
  את הכתובת בדפדפן).
- מסד הנתונים החינמי נמחק אוטומטית אחרי 90 יום — לגמרי מספיק לדמו,
  רק לזכור את זה קדימה.
