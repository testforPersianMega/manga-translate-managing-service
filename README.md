# پلتفرم داخلی مدیریت ترجمه

این پروژه یک پنل مدیریت داخلی برای مدیریت فرآیند ترجمه مانگا/مانهوا/کمیک است. رابط کاربری راست‌چین و فارسی است و نقش‌ها/دسترسی‌ها به صورت منعطف قابل تنظیم هستند.

## ویژگی‌های کلیدی
- احراز هویت با ایمیل/رمز عبور (NextAuth Credentials)
- RBAC + دسترسی‌های ریزدانه با override برای هر کاربر
- محدودسازی دسترسی به کتاب‌ها به صورت All Books یا Selected Books
- مدیریت کتاب‌ها، چپترها، تخصیص و claim چپتر
- داشبوردهای متفاوت برای مدیر کل، مدیر پروژه و مترجم
- Docker-first با PostgreSQL و Prisma

## اجرا با Docker (پیشنهادی)

```bash
cp .env.example .env
# مقدار NEXTAUTH_SECRET را تغییر دهید

docker compose up --build
```

پس از بالا آمدن سرویس‌ها:
- پنل در آدرس `http://localhost:3000`
- ادمین اولیه:
  - ایمیل: `admin@example.com`
  - رمز عبور: `Admin1234!`

## اجرای محلی (بدون Docker)

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

## دستورات مهم Prisma

```bash
npm run prisma:migrate
npm run prisma:seed
npm run prisma:studio
```

## نکات
- ثبت‌نام عمومی غیرفعال است. فقط ایجاد مستقیم کاربر یا لینک دعوت وجود دارد.
- لینک دعوت در صفحه ایجاد کاربر نمایش داده می‌شود.
- مدیریت نقش‌ها و دسترسی‌ها از منوی نقش‌ها قابل انجام است.

