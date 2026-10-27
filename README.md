# Roomly AI

AI Interior Decision Platform — อัปโหลดภาพห้องจริง (สูงสุด 6 มุม) ให้ AI ออกแบบใหม่ ตัดสินใจเก็บ/เปลี่ยน/นำเฟอร์นิเจอร์ออก แล้วจับคู่กับสินค้าจริงจาก IKEA / HomePro ภายในงบ

## สถาปัตยกรรม

```
RoomlyAI/
├── frontend/   # React + Vite (deploy เป็น static site เช่น Netlify)
└── backend/    # FastAPI — เรียก OpenAI เท่านั้น (ต้องใช้ secret key ฝั่งเซิร์ฟเวอร์)
```

- **Supabase** เก็บทุกอย่างที่เหลือ: ผู้ใช้ (Auth), ตาราง `projects` / `products`, ภาพ (Storage bucket `room-images`) — เบราว์เซอร์คุยกับ Supabase ตรงๆ
- **Backend** รับ access token ของ Supabase, ตรวจว่าผู้เรียกเป็นเจ้าของโปรเจกต์, จำกัดจำนวนครั้งที่เรียก AI ต่อผู้ใช้, แล้วเรียก OpenAI + โมเดลตัดภาพ (YOLOE + SAM 2)
- ราคาสินค้าสดดึงจากหน้าสินค้าของ IKEA / HomePro ผ่าน backend (`POST /api/v1/products/prices`)

## ขั้นตอน deploy

1. **Supabase** — สร้างโปรเจกต์ แล้วรัน `backend/supabase/schema.sql` ใน SQL Editor (ถ้ามีฐานข้อมูลอยู่แล้ว สคริปต์รันซ้ำได้ และจะแทนที่นโยบาย Storage เดิมด้วยนโยบายที่เขียน/ลบได้เฉพาะเจ้าของโปรเจกต์) แล้วรัน `seed_products.sql`
   - Authentication → URL Configuration: ตั้ง Site URL เป็นโดเมนจริง และเพิ่ม `https://<โดเมน>/reset-password` ใน Redirect URLs (ลิงก์ลืมรหัสผ่านทางอีเมลใช้หน้านี้)
   - Authentication → Providers → Email: เปิด Confirm email ตามต้องการ และตั้ง SMTP ของตัวเองสำหรับใช้งานจริง (SMTP เริ่มต้นของ Supabase จำกัดจำนวนอีเมลมาก)
2. **Backend** — ดู `backend/README.md` (มี `Dockerfile`) ตั้ง environment ตาม `backend/.env.example` โดยตั้ง `ENVIRONMENT=production` และ `CORS_ORIGINS` เป็นโดเมนของ frontend
3. **Frontend** — ตั้ง environment ตอน build: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_BASE_URL` (เช่น `https://api.example.com/api/v1`) แล้ว `npm run build` (Netlify ใช้ `netlify.toml` + `public/_headers`)

## พัฒนาในเครื่อง

```bash
npm --prefix frontend install
npm --prefix frontend run dev        # http://localhost:5173

cd backend && python -m venv venv && venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env               # แก้ค่า และตั้ง ENVIRONMENT=development
uvicorn app.main:app --port 8000
```

ปิด AI ชั่วคราว (ซ่อมระบบ): ตั้ง `AI_ENABLED=false` แล้วรีสตาร์ท backend — เส้นทาง AI จะตอบ 503 ส่วนล็อกอินและดูโปรเจกต์ใช้ได้ปกติ
