# Roomly AI — AI Service (Python, self-hosted)

> ตอนนี้เว็บใช้ Edge Function `api` บน Supabase (`../supabase/functions/api`) เป็น backend หลัก โฟลเดอร์นี้เป็นทางเลือกแบบ self-host ที่ให้เส้นขอบวัตถุแม่นยำกว่า (YOLOE + SAM 2) ใช้ได้โดยตั้ง `VITE_API_BASE_URL` ของ frontend ให้ชี้มาที่ `http://<host>/api/v1`

FastAPI service ที่ทำหน้าที่เดียว: เรียก OpenAI และโมเดลตัดภาพในส่วนที่ต้องใช้ secret key ฝั่งเซิร์ฟเวอร์ ส่วนที่เหลือ (auth, ตาราง `projects`, ภาพ, แคตตาล็อกสินค้า) อยู่ใน Supabase และถูกเรียกจาก frontend โดยตรง service นี้ไม่มีฐานข้อมูลของตัวเอง

## โครงสร้าง

```
backend/
├── app/
│   ├── main.py                 # FastAPI app, CORS, security headers, ตรวจค่า production ตอนเริ่ม
│   ├── core/
│   │   ├── config.py           # ค่าตั้งจาก environment
│   │   ├── rate_limit.py       # เพดานการเรียก AI ต่อผู้ใช้ (ต่อนาที/ต่อวัน)
│   │   ├── openai_client.py    # OpenAI wrapper (text / vision / image)
│   │   └── supabase_storage.py # อัปโหลดภาพที่ AI สร้างด้วย token ของผู้ใช้
│   ├── api/
│   │   ├── deps.py             # ตรวจ token, ตรวจว่าเป็นเจ้าของโปรเจกต์, rate limit, จำกัด URL ภาพ
│   │   └── v1/                 # generate, decisions, styles, products
│   └── services/               # ai_service, object_segmentation, price_service, image_difference
├── models/                     # น้ำหนักโมเดล (ดาวน์โหลดอัตโนมัติครั้งแรก; อยู่นอก git)
├── scripts/                    # เครื่องมือดูแลแคตตาล็อก (add_products, refresh_prices)
├── supabase/                   # schema.sql + seed_products.sql
├── Dockerfile
└── .env.example
```

## Endpoints

ทุกเส้นต้องมี `Authorization: Bearer <supabase-access-token>`

| Method | Path | หน้าที่ |
|---|---|---|
| POST | `/api/v1/projects/{id}/generate` | สร้างภาพห้องใหม่จากภาพจริง |
| POST | `/api/v1/projects/{id}/decisions/detect` | ตรวจจับเฟอร์นิเจอร์ + เส้นขอบ |
| POST | `/api/v1/projects/{id}/decisions/suggest` | ให้คะแนนและแนะนำ Keep/Replace/Remove |
| POST | `/api/v1/projects/{id}/decisions/regenerate` | แก้เฉพาะชิ้น (ลบ/เปลี่ยน/ใส่สินค้าจริง) |
| POST | `/api/v1/styles/recommend` | แนะนำสไตล์จากภาพห้อง |
| POST | `/api/v1/products/prices` | ราคาและสต็อกสดจากหน้าสินค้า IKEA / HomePro |
| GET | `/health` | ตรวจสถานะ (ไม่ต้องล็อกอิน) |

เส้นที่ผูกกับ `{id}` ตรวจว่าผู้เรียกเป็นเจ้าของโปรเจกต์ (ผ่าน RLS ของ Supabase), URL ภาพต้องเป็น Supabase Storage ของโปรเจกต์นี้เท่านั้น (รูปสินค้าต้องมาจาก IKEA / HomePro), และเส้น AI ถูกจำกัดต่อผู้ใช้ตาม `AI_REQUESTS_PER_MINUTE` / `AI_REQUESTS_PER_DAY` (ตอบ 429 เมื่อเกิน)

## ตั้งค่า (environment)

ดู `.env.example` ค่าสำคัญ: `ENVIRONMENT=production`, `CORS_ORIGINS` (โดเมนจริงของ frontend), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL` (ค่าเริ่มต้น `gpt-image-1.5`), `AI_ENABLED`

เมื่อ `ENVIRONMENT=production` เซิร์ฟเวอร์ปิด `/docs` และ **ไม่ยอมเริ่ม** ถ้าไม่มี Supabase/OpenAI key หรือ `CORS_ORIGINS` ยังเป็น localhost

## รัน

```bash
python -m venv venv
venv\Scripts\activate          # Windows  (macOS/Linux: source venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env         # แล้วแก้ค่า (ในเครื่องใช้ ENVIRONMENT=development)
uvicorn app.main:app --port 8000
```

ไม่ต้องใช้ `--reload` กับโหมดจริง

### Docker

```bash
docker build -t roomly-api backend
docker run -p 8000:8000 --env-file backend/.env roomly-api
```

ใช้ **1 worker** (ค่าเริ่มต้นใน Dockerfile) เพราะตัวจำกัดการเรียก AI เก็บในหน่วยความจำของแต่ละโปรเซส ถ้าจะรันหลายโปรเซส/หลายเครื่อง ให้ย้ายตัวจำกัดไป Redis ก่อน โมเดลตัดภาพกิน RAM ราว 1–2 GB เลือกเครื่องให้พอ

### เครื่องมือแคตตาล็อก

`scripts/refresh_prices.py` อัปเดตราคาอ้างอิงในตาราง `products`, `scripts/add_products.py` เพิ่มสินค้าใหม่
