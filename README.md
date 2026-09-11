# Roomly AI

AI Interior Decision Platform — อัปโหลดภาพห้องจริง ให้ AI ออกแบบใหม่ ตัดสินใจเก็บ/เปลี่ยน/นำเฟอร์นิเจอร์ออก แล้วจับคู่กับสินค้าจริงจาก IKEA / Shopee

## โครงสร้างโปรเจกต์

```
RoomlyAI/
├── frontend/   # React + Vite app (ดู frontend/README.md)
└── backend/    # ยังไม่เริ่มพัฒนา (ดู backend/README.md)
```

ตอนนี้ระบบเป็น **frontend-only** — ข้อมูลโปรเจกต์และภาพเก็บอยู่ใน localStorage / IndexedDB ของเบราว์เซอร์ ยังไม่มี backend หรือ auth จริง

## เริ่มพัฒนา

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

หรือ `cd frontend && npm install && npm run dev`
