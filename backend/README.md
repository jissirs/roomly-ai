# Roomly AI — AI Service

FastAPI service that does one thing: calls OpenAI for the pieces of the product flow that need a server-side secret key. Everything else — auth, the `projects` table, room-photo storage, the product catalog — lives directly in Supabase and is called from the frontend (see `../frontend/src/lib/supabase.js`). This service has no database of its own.

## โครงสร้าง

```
backend/
├── app/
│   ├── main.py                # FastAPI app, CORS, router mount
│   ├── core/
│   │   ├── config.py           # env-based settings (pydantic-settings)
│   │   └── openai_client.py    # OpenAI wrapper (text / vision / image-gen)
│   ├── api/
│   │   ├── deps.py             # get_current_user_id — validates the caller's
│   │   │                         Supabase access token via Supabase's own
│   │   │                         /auth/v1/user endpoint (no JWT secret needed)
│   │   └── v1/
│   │       ├── router.py        # aggregates routers under /api/v1
│   │       ├── decisions.py     # POST .../decisions/detect, .../decisions/suggest
│   │       └── generate.py      # POST /projects/{id}/generate
│   ├── schemas/
│   │   └── decision.py          # request/response DTOs (pydantic)
│   └── services/
│       └── ai_service.py        # the actual OpenAI calls
├── supabase/
│   ├── schema.sql               # run once in the Supabase SQL editor
│   └── seed_products.sql        # curated product catalog seed
├── tests/
├── requirements.txt
└── .env.example
```

## Endpoints (all require `Authorization: Bearer <supabase-access-token>`)

- `POST /projects/{id}/decisions/detect` — `{image_url}` → detects furniture in a room photo (vision, gpt-4o-mini). Returns a best-effort item list with estimated position — not pixel-accurate; a dedicated detection model would be needed for that.
- `POST /projects/{id}/decisions/suggest` — `{room_type, style, budget, ai_instructions, detected_objects}` → scores each object and recommends keep/replace/remove (text, gpt-4o-mini).
- `POST /projects/{id}/generate?style=...&ai_instructions=...` → generates a redesigned room image (dall-e-2, 512×512 — cheapest option). Returns `{image_url}`; the URL is OpenAI-hosted and expires after about an hour, so save it (e.g. to Supabase Storage) if it needs to persist.

All three model choices are the cheapest OpenAI offers for the job — swap `openai_vision_model` / `openai_image_model` in `core/config.py` for higher quality later.

## รัน

ต้องมี Python 3.11+ และ [Supabase project ที่ตั้งค่าแล้ว](../README.md)

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

pip install -r requirements.txt
copy .env.example .env         # แล้วแก้ค่าตามจริง (Windows: copy, macOS/Linux: cp)

uvicorn app.main:app --reload --port 8000
```

เปิด http://localhost:8000/docs สำหรับ Swagger UI, หรือ http://localhost:8000/health เพื่อเช็คว่า server รันอยู่

### รันเทส

```bash
pytest
```

## ขั้นตอนถัดไปที่ยังไม่ทำ

- ต่อ Object Decision UI (`frontend/src/pages/Decision/DecisionPage.jsx`) ให้เรียก `/decisions/detect` ด้วยภาพห้องจริงของโปรเจกต์ แทนรายการเฟอร์นิเจอร์ที่ยังฝังโค้ดอยู่ (`OBJECTS` ในไฟล์เดียวกัน)
- ต่อ AI Generate (`frontend/src/pages/Generate/GeneratePage.jsx`) ให้เรียก `/projects/{id}/generate` จริง แทนการจำลองด้วย `setTimeout`
- เก็บภาพที่ dall-e-2 สร้างไว้ถาวรใน Supabase Storage ก่อน URL ของ OpenAI หมดอายุ
