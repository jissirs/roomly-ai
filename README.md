# Roomly AI

AI Interior Decision Platform — อัปโหลดภาพห้องจริง (สูงสุด 6 มุม) ให้ AI ออกแบบใหม่ ตัดสินใจเก็บ/เปลี่ยน/นำเฟอร์นิเจอร์ออก แล้วจับคู่กับสินค้าจริงจาก IKEA / HomePro ภายในงบ

## สถาปัตยกรรม

```
RoomlyAI/
├── frontend/   # React + Vite (deploy เป็น static site เช่น Netlify)
└── backend/    # FastAPI (Python) — AI backend: เรียก OpenAI + โมเดลตัดภาพ YOLOE/SAM 2
                # (+ supabase/schema.sql และ seed_products.sql สำหรับฐานข้อมูล)
```

> เวอร์ชันที่ deploy อยู่ตอนนี้ใช้ AI backend เป็น Supabase Edge Function ชื่อ `api` (TypeScript) ซึ่ง **ไม่ได้เก็บไว้ใน repo นี้** ส่วนใน repo คือ backend Python ที่ทำหน้าที่เดียวกันและใช้แทนกันได้

- **Supabase** เก็บทุกอย่าง: ผู้ใช้ (Auth), ตาราง `projects` / `products`, ภาพ (Storage bucket `room-images`)
- **AI backend** รับ access token ของ Supabase, ตรวจว่าเป็นเจ้าของโปรเจกต์, จำกัดจำนวนครั้งที่เรียก AI ต่อผู้ใช้ แล้วเรียก OpenAI ได้สองแบบ:
  - **Supabase Edge Function `api`** (ที่ใช้อยู่ตอนนี้, ไม่อยู่ใน repo) — เบราว์เซอร์เรียก `https://<project>.supabase.co/functions/v1/api` ไม่ต้องมีเซิร์ฟเวอร์แยก โควตาเก็บในตาราง `ai_usage` (อยู่ใน `schema.sql`) ข้อแลกเปลี่ยน: รันโมเดลตัดภาพไม่ได้ จึงใช้กรอบสี่เหลี่ยมจาก GPT
  - **`backend/` (Python, FastAPI)** — เส้นขอบวัตถุแม่นยำกว่าด้วย YOLOE + SAM 2 ต้อง host เอง (ดู `backend/README.md`) แล้วตั้ง `VITE_API_BASE_URL` ของ frontend ให้ชี้มาที่ `http://<host>/api/v1`
- ราคาสินค้าสดดึงจากหน้าสินค้าของ IKEA / HomePro (`POST /products/prices`)

## ขั้นตอน deploy

1. **Supabase**
   - รัน `backend/supabase/schema.sql` ใน SQL Editor (รันซ้ำได้) แล้วรัน `seed_products.sql` — ไฟล์นี้สร้างตาราง นโยบาย Storage ที่เขียน/ลบได้เฉพาะเจ้าของโปรเจกต์ และตาราง/ฟังก์ชันโควตา AI
   - Authentication → URL Configuration: ตั้ง Site URL เป็นโดเมนจริง และเพิ่ม `https://<โดเมน>/reset-password` ใน Redirect URLs
   - ตั้ง SMTP ของตัวเอง (Authentication → Emails) — ตัวส่งของ Supabase ส่งได้ 2 อีเมล/ชั่วโมง และเฉพาะสมาชิกทีม
2. **AI backend** — เลือกอย่างใดอย่างหนึ่ง
   - Edge Function `api` บน Supabase (เปิด "Verify JWT" ไว้ และเพิ่ม Secret `OPENAI_API_KEY`; ตัวเลือก: `AI_ENABLED`, `AI_REQUESTS_PER_MINUTE`, `AI_REQUESTS_PER_DAY`, `OPENAI_IMAGE_MODEL`, `CORS_ORIGINS`) — โค้ดไม่อยู่ใน repo นี้
   - หรือ `backend/` (Python) ตาม `backend/README.md`
3. **Frontend** — ตั้ง environment ตอน build: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (ถ้าใช้ Edge Function ไม่ต้องตั้ง `VITE_API_BASE_URL`; ถ้าใช้ backend Python ให้ตั้งเป็น `http://<host>/api/v1`) แล้ว `npm run build` และ deploy โฟลเดอร์ `dist` (Netlify: `netlify.toml`, `public/_headers`, `public/_redirects`)

## พัฒนาในเครื่อง

```bash
npm --prefix frontend install
npm --prefix frontend run dev        # http://localhost:5173
```

ปิด AI ชั่วคราว (ซ่อมระบบ): ตั้ง `AI_ENABLED=false` (secret ของ Edge Function หรือ `.env` ของ backend Python) — เส้นทาง AI จะตอบ 503 ส่วนล็อกอินและดูโปรเจกต์ใช้ได้ปกติ
