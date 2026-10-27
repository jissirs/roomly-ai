# Roomly AI

AI Interior Decision Platform — อัปโหลดภาพห้องจริง (สูงสุด 6 มุม) ให้ AI ออกแบบใหม่ ตัดสินใจเก็บ/เปลี่ยน/นำเฟอร์นิเจอร์ออก แล้วจับคู่กับสินค้าจริงจาก IKEA / HomePro ภายในงบ

## สถาปัตยกรรม

```
RoomlyAI/
├── frontend/   # React + Vite (deploy เป็น static site เช่น Netlify)
├── backend/    # FastAPI (Python) — ทางเลือกแบบ self-host: เรียก OpenAI + โมเดลตัดภาพ YOLOE/SAM 2
└── supabase/   # Edge Function `api` (TypeScript) — backend ที่ใช้งานจริงบน Supabase
```

- **Supabase** เก็บทุกอย่าง: ผู้ใช้ (Auth), ตาราง `projects` / `products`, ภาพ (Storage bucket `room-images`) และรัน AI backend ในรูป Edge Function — เบราว์เซอร์เรียก `https://<project>.supabase.co/functions/v1/api` ได้โดยตรง ไม่ต้องมีเซิร์ฟเวอร์แยก
- Edge Function ตรวจ token, ตรวจว่าเป็นเจ้าของโปรเจกต์, จำกัดจำนวนครั้งที่เรียก AI ต่อผู้ใช้ (ตาราง `ai_usage`), แล้วเรียก OpenAI
- ราคาสินค้าสดดึงจากหน้าสินค้าของ IKEA / HomePro (`POST /products/prices`)
- **ข้อแลกเปลี่ยน:** Edge Function รันโมเดลตัดภาพไม่ได้ จึงใช้กรอบสี่เหลี่ยมจาก GPT แทนเส้นขอบตามรูปทรงวัตถุ ถ้าต้องการเส้นขอบแม่นยำ ให้ใช้ backend Python (`backend/`) แล้วตั้ง `VITE_API_BASE_URL` ชี้ไปที่มัน

## ขั้นตอน deploy

1. **Supabase**
   - รัน `backend/supabase/schema.sql` ใน SQL Editor (รันซ้ำได้) แล้วรัน `seed_products.sql` — ไฟล์นี้สร้างตาราง นโยบาย Storage ที่เขียน/ลบได้เฉพาะเจ้าของโปรเจกต์ และตาราง/ฟังก์ชันโควตา AI
   - Authentication → URL Configuration: ตั้ง Site URL เป็นโดเมนจริง และเพิ่ม `https://<โดเมน>/reset-password` ใน Redirect URLs
   - ตั้ง SMTP ของตัวเอง (Authentication → Emails) — ตัวส่งของ Supabase ส่งได้ 2 อีเมล/ชั่วโมง และเฉพาะสมาชิกทีม
   - Edge Functions → deploy ฟังก์ชัน `api` จาก `supabase/functions/api/index.ts` (เปิด "Verify JWT" ไว้) แล้วเพิ่ม **Secrets**: `OPENAI_API_KEY` (จำเป็น) และถ้าต้องการ `AI_ENABLED`, `AI_REQUESTS_PER_MINUTE`, `AI_REQUESTS_PER_DAY`, `OPENAI_IMAGE_MODEL`, `CORS_ORIGINS`
2. **Frontend** — ตั้ง environment ตอน build: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (ไม่ต้องตั้ง `VITE_API_BASE_URL` ถ้าใช้ Edge Function) แล้ว `npm run build` และ deploy โฟลเดอร์ `dist` (Netlify: `netlify.toml`, `public/_headers`, `public/_redirects`)

## พัฒนาในเครื่อง

```bash
npm --prefix frontend install
npm --prefix frontend run dev        # http://localhost:5173
```

ปิด AI ชั่วคราว (ซ่อมระบบ): ตั้ง secret `AI_ENABLED=false` ใน Supabase — เส้นทาง AI จะตอบ 503 ส่วนล็อกอินและดูโปรเจกต์ใช้ได้ปกติ

การใช้ backend Python แทน Edge Function: ดู `backend/README.md`
