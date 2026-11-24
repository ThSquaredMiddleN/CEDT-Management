# คู่มือ deploy: Render + Supabase + Vercel

วันที่: 25 พ.ย. 2026 · เขียนจาก `main` ที่ `2c17183` (หลัง PR #17)

| ส่วน | ที่อยู่ | ตัวอย่าง URL |
|---|---|---|
| Frontend (React + Vite) | Vercel | `https://cedt-xxx.vercel.app` |
| Backend (Fastify) | Render (แผนฟรี) | `https://cedt-backend.onrender.com` |
| Database (PostgreSQL) | Supabase | session pooler `aws-0-ap-southeast-1.pooler.supabase.com:5432` |
| ไฟล์ | Supabase Storage (หลังขั้นที่ 6) | bucket แบบ private |

ผู้ใช้เปิดเว็บที่โดเมนของ Vercel เท่านั้น Vercel ส่งต่อทุกคำขอ `/api/*` ไปที่ Render (rewrite) เบราว์เซอร์จึงเห็นเว็บกับ API เป็นโดเมนเดียวกัน cookie ล็อกอินและการตรวจ origin ทำงานได้ตามเดิม

> **ห้ามใส่รหัสผ่านฐานข้อมูล, key หรือ token ใดๆ ลงใน repo** ใส่ในหน้า Environment ของ Render/Vercel หรือไฟล์ `.env.*` ในเครื่องที่อยู่ใน `.gitignore` เท่านั้น

---

## 0. ข้อจำกัดที่ต้องรู้ก่อน (จนกว่าขั้นที่ 6 จะเสร็จ)

| เรื่อง | ผลบน Render | ทางแก้ |
|---|---|---|
| รูปข่าว | เขียนลงดิสก์ของเครื่อง (`NEWS_UPLOAD_DIR`) Render ฟรีไม่มีดิสก์ถาวร **รูปที่อัปโหลดจะหายเมื่อ deploy ใหม่หรือเครื่อง restart** | ขั้นที่ 6 ย้ายรูปข่าวไป `fileStore` + Supabase Storage |
| ตรวจใบเสร็จ (OCR) | ใช้ไม่ได้ เพราะ `OCR_SERVICE_URL` ถูกบังคับให้เป็น localhost (ข้อมูลใบเสร็จห้ามออกนอกเครื่อง ตาม PDPA) และ Render ไม่มี OCR sidecar | ปิดฟีเจอร์นี้ตอน demo หรือ deploy OCR ในเครื่องเดียวกันภายหลัง |
| Server หลับ | Render ฟรีหลับเมื่อไม่มีคนใช้ เข้าครั้งแรกรอประมาณ 1 นาที ระหว่างหลับ LINE ไม่ส่ง | เปิดเว็บก่อน demo 1–2 นาที หรือย้ายไป Fly.io (~$2/เดือน) |
| บัญชีทดสอบ | seed สร้างบัญชีที่รหัสผ่านรู้กันทั่วไป (`admin@cedt.edu`, `@test.local`) | ดูหัวข้อ 7 ความปลอดภัย |

---

## 1. แก้โค้ดก่อน deploy (ทำครั้งเดียว)

**1.1 คำสั่ง start ของ backend** — `npm start` ใช้บน Render ไม่ได้ เพราะ
- เรียก `--env-file=.env` แต่บน Render ไม่มีไฟล์ `.env` (ค่าอยู่ใน environment) Node จะ error
- ชี้ไป `dist/server.js` แต่ `tsc` สร้างไฟล์ที่ `dist/src/server.js` (เพราะ `rootDir: "."`)

ในคู่มือนี้ใช้ start command `node dist/src/server.js` ตรงๆ บน Render (ตรวจแล้วว่าเปิดได้และ `/health` ตอบ 200) จะแก้ script `start` ใน `package.json` ให้ถูกด้วยก็ได้

**1.2 `prototype-1/frontend/vercel.json`** (สร้างใหม่) แทน `<RENDER_URL>` ด้วย URL ของ Render (ไม่มี `/` ท้าย)

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    { "source": "/api/:path*", "destination": "<RENDER_URL>/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/api/:path*",
      "headers": [{ "key": "x-vercel-enable-rewrite-caching", "value": "0" }]
    }
  ]
}
```

- rule แรกส่ง API ไป Render rule ที่สองให้ทุกหน้าของ React (เช่น `/admin/access`) เปิดตรงหรือกด refresh ได้ Vercel ใช้ rule แรกที่ตรง ลำดับจึงสำคัญ
- `headers`: โปรเจกต์ Vercel ที่สร้างตั้งแต่ 6 เม.ย. 2026 **cache คำตอบของ external rewrite โดยอัตโนมัติ** ตาม header ที่ backend ส่งมา API ของเราตอบข้อมูลรายคน จึงปิด cache ของ `/api/*` ด้วย header นี้ ไม่งั้นผู้ใช้คนหนึ่งอาจเห็นข้อมูลที่ cache ของอีกคน

**1.3 (แนะนำ) backend ส่ง `Cache-Control: no-store` ทุกคำตอบใต้ `/api`** กันอีกชั้นเผื่อมีใครลบ header ใน `vercel.json`

---

## 2. Supabase: สร้างฐานข้อมูล

1. สมัคร [supabase.com](https://supabase.com) → **New project**
   - Region: **Southeast Asia (Singapore)** (ใกล้ไทยและใกล้ Render สิงคโปร์)
   - ตั้ง database password ยาวๆ แล้วเก็บไว้ในที่ปลอดภัย (ต้องใช้ใน connection string)
2. **ปิด Data API** (สำคัญ): Project Settings → Data API → ปิด
   Supabase เปิด REST API ให้อ่านตารางใน schema `public` ผ่าน anon key ซึ่งเป็นค่าสาธารณะ ระบบเราไม่ได้ใช้ API นี้ (backend ต่อฐานข้อมูลตรงผ่าน Prisma) และตารางไม่ได้เปิด Row Level Security ถ้าเปิด Data API ไว้ **ใครก็อ่านข้อมูลผู้ใช้ได้**
3. เอา connection string: ปุ่ม **Connect** บนหน้าโปรเจกต์ → เลือก **Session pooler** (port **5432**)
   ```
   postgresql://postgres.<project-ref>:<PASSWORD>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
   ```
   - **อย่าใช้ Direct connection** (`db.<ref>.supabase.co`) เพราะแผนฟรีเป็น IPv6 อย่างเดียว และ Render ต่อออก IPv6 ไม่ได้
   - **อย่าใช้ Transaction pooler** (port 6543) เว้นแต่จะเติม `?pgbouncer=true` และทดสอบแล้ว session pooler ใช้ได้ทั้งแอปและ migration
4. สร้างตารางและข้อมูลตั้งต้นจากเครื่องตัวเอง (ทำครั้งแรกครั้งเดียว)
   - สร้างไฟล์ `prototype-1/backend/.env.supabase.local` (ชื่อต้องลงท้าย `.local` เพราะ `.gitignore` กันแค่ `.env`, `.env.local` และ `.env.*.local` ตรวจด้วย `git check-ignore -v .env.supabase.local` ต้องเห็นบรรทัดที่ตรง):
     ```
     DATABASE_URL="<session pooler string จากข้อ 3>"
     ```
   - รันใน `prototype-1/backend` (PowerShell) ค่าที่ตั้งด้วย `$env:` อยู่แค่ในหน้าต่างนี้ ปิดหน้าต่างเมื่อเสร็จ:
     ```powershell
     $env:DATABASE_URL = "<session pooler string>"; npx prisma migrate deploy
     ```
   - migration แรกสร้าง extension `citext`, `btree_gist`, `pgcrypto` เอง ถ้า error เรื่อง extension ให้เปิดที่ Database → Extensions แล้วรันใหม่
   - ข้อมูลตั้งต้น (ห้อง วิชา ผู้ใช้ตัวอย่าง บัญชีทดสอบ): `npx tsx --env-file=.env.supabase.local prisma/seed.ts` (อ่านหัวข้อ 7 ก่อน)
   - ให้ IT Admin กับคนแรก: `npx tsx --env-file=.env.supabase.local scripts/grant-role.ts <email> it_admin`
5. Storage (ทำหลังขั้นที่ 6): Storage → New bucket → ชื่อ `files` → **ไม่ติ๊ก Public** แล้วเอา service role key ไปใส่ใน Render (ชื่อตัวแปรตามที่ขั้นที่ 6 กำหนด) service role key ห้ามใส่ใน frontend เด็ดขาด

ข้อจำกัดแผนฟรี (เช็กที่ [supabase.com/pricing](https://supabase.com/pricing) อีกครั้ง): ไฟล์รวม 1 GB, ไฟล์ละไม่เกิน 50 MB, ดาวน์โหลดประมาณ 5 GB/เดือน เกินแล้วโปรเจกต์ถูกจำกัด (ไม่เก็บเงิน) และโปรเจกต์ที่ไม่มีคนใช้นานอาจถูกพัก ให้เข้าไปเช็กก่อนวัน demo

---

## 3. Render: deploy backend

1. สมัคร [render.com](https://render.com) ด้วย GitHub → **New → Web Service** → เลือก repo `CEDT-Management` (ให้สิทธิ์ Render อ่าน repo ขององค์กร `ThSquaredMiddleN` ถ้าถูกถาม)
2. ตั้งค่า

   | ช่อง | ค่า |
   |---|---|
   | Name | `cedt-backend` (กลายเป็น `https://cedt-backend.onrender.com`) |
   | Region | Singapore |
   | Branch | `main` |
   | Root Directory | `prototype-1/backend` |
   | Runtime | Node |
   | Build Command | `npm ci --include=dev && npx prisma generate && npx prisma migrate deploy && npm run build` |
   | Start Command | `node dist/src/server.js` |
   | Instance Type | Free |
   | Health Check Path (Advanced) | `/health` |

   - `--include=dev`: เมื่อตั้ง `NODE_ENV=production` npm จะข้าม devDependencies ทำให้ไม่มี `typescript` และ `prisma` CLI ตอน build
   - `prisma migrate deploy` อยู่ใน build command เพราะ pre-deploy command ของ Render อาจไม่มีในแผนฟรี migration จึงรันทุกครั้งที่ deploy (ถ้าไม่มี migration ใหม่ก็ไม่ทำอะไร)
   - Node version: Render อ่านจาก `engines` ใน `package.json` (`^22.12.0 || ^24...`) ถ้าต้องการล็อกให้ตั้ง env `NODE_VERSION=22`
3. Environment Variables

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | session pooler string จาก Supabase |
   | `NODE_ENV` | `production` (ทำให้ cookie เป็น `Secure`) |
   | `APP_ORIGIN` | ใส่ชั่วคราว `https://example.com` แล้วกลับมาแก้เป็นโดเมน Vercel ในขั้นที่ 4 |
   | `APP_TZ` | `Asia/Bangkok` |
   | LINE (ถ้าใช้) | `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_OA_BASIC_ID` — **ห้ามตั้ง `LINE_DRY_RUN`** (แอปไม่ยอมเปิดใน production) |

   ไม่ต้องตั้ง `PORT` เพราะ Render กำหนดให้เอง และ server ฟังที่ `0.0.0.0` อยู่แล้ว
4. **Create Web Service** แล้วรอ build เสร็จ ทดสอบ `https://cedt-backend.onrender.com/health` ต้องได้ 200

---

## 4. Vercel: deploy frontend

1. แก้ `<RENDER_URL>` ใน `prototype-1/frontend/vercel.json` (หัวข้อ 1.2) เป็น URL จากขั้นที่ 3 แล้ว merge เข้า `main`
2. สมัคร [vercel.com](https://vercel.com) ด้วย GitHub → **Add New → Project** → import `CEDT-Management`

   | ช่อง | ค่า |
   |---|---|
   | Root Directory | `prototype-1/frontend` |
   | Framework Preset | Vite |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |
   | Environment Variables | ไม่จำเป็น (`VITE_PROMPTPAY_ID` ถ้าต้องการ QR พร้อมเพย์จริงในหน้าคลัง) |

3. **Deploy** แล้วจดโดเมนที่ได้ เช่น `https://cedt-xxx.vercel.app`
4. **กลับไป Render** → Environment → แก้ `APP_ORIGIN` เป็นโดเมนนี้ **ตรงทุกตัวอักษร** (`https://`, ไม่มี `/` ท้าย) → Save (Render deploy ใหม่ให้)
   - backend ปฏิเสธคำขอที่แก้ข้อมูลซึ่ง Origin ไม่ตรง `APP_ORIGIN` (403 "Bad origin") ล็อกอินจะไม่ผ่านถ้าค่าผิด
   - **Preview deployment** ของ Vercel (ทุก PR) ได้โดเมนอื่น จึงล็อกอินไม่ได้ ใช้โดเมน production เท่านั้น
   - ถ้าเปลี่ยนเป็นโดเมนจริงภายหลัง ต้องแก้ `APP_ORIGIN` ตามทุกครั้ง

---

## 5. LINE (ถ้าใช้)

1. LINE Developers Console → channel ของ Official Account → Messaging API → Webhook URL:
   `https://cedt-xxx.vercel.app/api/v1/line/webhook` (ผ่าน Vercel) หรือ `https://cedt-backend.onrender.com/api/v1/line/webhook` (ตรงไป Render) แล้วกด Verify
2. ถ้า Render หลับอยู่ ครั้งแรก LINE อาจ timeout ให้เปิดเว็บปลุกก่อนแล้วค่อย Verify
3. ใส่ `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` และ `LINE_OA_BASIC_ID` ใน Render

---

## 6. ตรวจหลัง deploy

- [ ] `https://cedt-backend.onrender.com/health` → 200
- [ ] เปิด `https://cedt-xxx.vercel.app` เห็นหน้าแรก กด refresh ที่ `/admin` แล้วไม่ 404
- [ ] ล็อกอินได้ (ถ้า 403 → `APP_ORIGIN` ผิด)
- [ ] เปิด `/admin/access` ด้วยบัญชี IT Admin เห็นตารางสิทธิ์
- [ ] ล็อกอินบัญชีอื่นในอีกเบราว์เซอร์ แล้วเห็นข้อมูลของตัวเอง ไม่ใช่ของบัญชีแรก (ตรวจว่า cache ปิดจริง)
- [ ] ส่งคำขอจองห้องหนึ่งรายการ แล้วเห็นในหน้าเจ้าหน้าที่
- [ ] (ถ้าใช้ LINE) ผูกบัญชีแล้วได้รับข้อความ

---

## 7. ความปลอดภัย

- **บัญชีทดสอบและรหัสผ่านตัวอย่าง:** seed สร้าง `admin@cedt.edu` และบัญชี `@test.local` ด้วยรหัสผ่านที่อยู่ในโค้ด ถ้าเว็บเปิดสู่สาธารณะ ให้
  - เปลี่ยนรหัสผ่านของบัญชีที่ใช้จริงทันทีหลัง seed หรือ
  - ปิดใช้งาน (`is_active = false`) บัญชี `@test.local` ที่ไม่ใช้ในการ demo
- **Supabase Data API ต้องปิด** (หัวข้อ 2 ข้อ 2)
- **Service role key / database password** อยู่ใน Render เท่านั้น ไม่อยู่ใน Vercel หรือ frontend
- **Cache ของ `/api` ต้องปิด** (หัวข้อ 1.2)
- ข้อมูลใบเสร็จมีชื่อและรหัสนิสิต (PDPA) ระบบจึงไม่ส่งไป OCR นอกเครื่อง อย่าแก้ `OCR_SERVICE_URL` ให้ชี้ไปที่อื่นเพื่อให้ใช้ได้บน Render

---

## 8. อัปเดตเวอร์ชัน

- merge เข้า `main` → Render และ Vercel deploy ใหม่เอง
- migration ใหม่รันใน build command ของ Render อัตโนมัติ (ตามกฎแผนของกลาง: ห้ามแก้ migration ที่ merge แล้ว)
- seed **ไม่** รันเอง ถ้าต้องการข้อมูลใหม่ให้รันจากเครื่องตามหัวข้อ 2 ข้อ 4 **ห้ามรัน `db:reset` หรือ `prisma migrate reset` กับฐานข้อมูล Supabase**

---

## 9. แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุที่เป็นไปได้ | ทางแก้ |
|---|---|---|
| Render build: `tsc: not found` / `prisma: not found` | ข้าม devDependencies | ใช้ `npm ci --include=dev` ใน build command |
| Render start: `.env: not found` หรือ `Cannot find module dist/server.js` | ใช้ `npm start` | Start Command = `node dist/src/server.js` |
| `P1001 Can't reach database server` | ใช้ direct connection (IPv6) | ใช้ Session pooler port 5432 |
| ล็อกอินแล้ว 403 "Bad origin" | `APP_ORIGIN` ไม่ตรงโดเมน Vercel | แก้ให้ตรงทุกตัวอักษร ไม่มี `/` ท้าย |
| ล็อกอินแล้วเด้งกลับหน้า login | เรียก API ข้ามโดเมน (cookie ไม่ติด) | frontend ต้องเรียก `/api/...` ผ่านโดเมน Vercel เท่านั้น (rewrite ในหัวข้อ 1.2) |
| refresh หน้า `/admin/...` แล้ว 404 | ไม่มี SPA fallback | rule `/(.*)` → `/index.html` ใน `vercel.json` |
| เห็นข้อมูลของคนอื่น / ข้อมูลไม่อัปเดต | Vercel cache API | header `x-vercel-enable-rewrite-caching: 0` |
| เปิดครั้งแรกช้ามาก | Render ฟรีหลับ | รอประมาณ 1 นาที หรือเปิดปลุกก่อน demo |
| รูปข่าวหาย | ดิสก์ Render ไม่ถาวร | รอขั้นที่ 6 (`fileStore` + Supabase Storage) |

---

## ที่มา

- Supabase: [Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres), [Prisma](https://supabase.com/docs/guides/database/prisma), [IPv4/IPv6](https://supabase.com/docs/guides/troubleshooting/supabase--your-network-ipv4-and-ipv6-compatibility-cHe3BP), [Pricing](https://supabase.com/pricing)
- Render: [Connect a Render service to Supabase Postgres](https://render.com/articles/how-to-connect-a-render-service-to-supabase-postgres), [Prisma: deploy to Render](https://www.prisma.io/docs/orm/v6/prisma-client/deployment/traditional/deploy-to-render)
- Vercel: [Rewrites](https://vercel.com/docs/rewrites), [FUNCTION_PAYLOAD_TOO_LARGE](https://vercel.com/docs/errors/function_payload_too_large)
