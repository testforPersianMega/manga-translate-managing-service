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
- برای ثبت خطاها در فایل، مقدار `ERROR_LOG_FILE` را تنظیم کنید (مثلاً `/app/storage/logs/error.log`).

## ذخیره‌سازی دارایی‌های چپتر
- فایل‌های تصاویر و JSONها روی دیسک داخل کانتینر در مسیر `/app/storage` ذخیره می‌شوند.
- در Docker Compose، این مسیر به `./storage` مپ شده است تا ماندگاری داشته باشد.

## فرمت‌های آپلود دارایی‌ها

### ۱) ZIP تصاویر چپتر
ساختار ساده با فقط تصاویر:
```
001.jpg
002.png
003.webp
```
ترتیب بر اساس نام عددی یا در غیر این صورت ترتیب لغوی انجام می‌شود.

### ۲) ZIP JSONهای صفحات
```
001.json
002.json
```
هر JSON به تصویر متناظر با یکی از روش‌ها متصل می‌شود:
- نام پایه یکسان (مثلاً `001.json` با `001.jpg`)
- فیلد `image` داخل JSON (مثل `"image": "001.jpg"` یا `"image": "001"`)

### ۳) ZIP ترکیبی (تصاویر + JSON)
```
images/001.jpg
images/002.jpg
json/001.json
json/002.json
```
یا تمام فایل‌ها در ریشه ZIP.

### ۴) آپلود انبوه چند چپتر
```
chapters/<chapterId>/images/*.jpg
chapters/<chapterId>/json/*.json
```
یا:
```
<bookTitleOrId>/<chapterNumber>/images/*.jpg
<bookTitleOrId>/<chapterNumber>/json/*.json
```

### نمونه حداقلی JSON
```json
{
  "image": "001.jpg",
  "blocks": []
}
```
ساختار JSON ممکن است در آینده توسعه یابد.
