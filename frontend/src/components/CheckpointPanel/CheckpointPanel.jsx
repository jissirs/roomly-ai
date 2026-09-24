import { useCallback, useEffect, useState } from 'react'
import { createCheckpoint, deleteCheckpoint, listCheckpoints, restoreCheckpoint } from '../../lib/checkpoints'
import './CheckpointPanel.css'

const STAGE_LABELS = {
  'room-input': 'กรอกข้อมูลห้อง',
  'ai-generate': 'AI Generate',
  result: 'ดูผลลัพธ์',
  'object-decision': 'ตัดสินใจเฟอร์นิเจอร์',
  'product-matching': 'เลือกสินค้า',
  saved: 'บันทึกแล้ว',
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
}

function CheckpointPanel({ projectId, onRestored }) {
  const [checkpoints, setCheckpoints] = useState([])
  const [name, setName] = useState('')
  const [busyId, setBusyId] = useState('')
  const [confirmId, setConfirmId] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setCheckpoints(await listCheckpoints(projectId))
    } catch {
      setError('โหลด Checkpoint ไม่สำเร็จ (ตรวจว่ารัน schema.sql ส่วน project_checkpoints ใน Supabase แล้ว)')
    }
  }, [projectId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh()
  }, [refresh])

  async function run(action, doneMessage, id = 'new') {
    setBusyId(id)
    setError('')
    setMessage('')
    try {
      await action()
      setMessage(doneMessage)
      await refresh()
    } catch {
      setError('ทำรายการไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setBusyId('')
      setConfirmId('')
    }
  }

  return (
    <section className="checkpoint-panel" aria-label="Checkpoint ของโปรเจกต์">
      <div className="checkpoint-heading">
        <div><span>CHECKPOINTS</span><strong>จุดบันทึกของโปรเจกต์</strong></div>
        <small>{checkpoints.length} รายการ</small>
      </div>
      <p className="checkpoint-note">บันทึกสถานะปัจจุบัน (สไตล์ งบ ผลตัดสินใจ สินค้าที่เลือก และภาพที่ AI สร้าง) แล้วย้อนกลับมาได้ภายหลัง โดยไม่ต้อง generate ภาพใหม่</p>

      <form
        className="checkpoint-form"
        onSubmit={(event) => {
          event.preventDefault()
          run(async () => { await createCheckpoint(projectId, name); setName('') }, 'บันทึก Checkpoint แล้ว')
        }}
      >
        <input
          value={name}
          maxLength="60"
          onChange={(event) => setName(event.target.value)}
          placeholder="ตั้งชื่อ เช่น ก่อนเปลี่ยนสไตล์เป็น Japandi"
          aria-label="ชื่อ Checkpoint"
        />
        <button type="submit" disabled={busyId === 'new'}>{busyId === 'new' ? 'กำลังบันทึก...' : 'บันทึก Checkpoint'}</button>
      </form>

      {message ? <p className="checkpoint-message" role="status">{message}</p> : null}
      {error ? <p className="checkpoint-error" role="alert">{error}</p> : null}

      <ul className="checkpoint-list">
        {checkpoints.map((item) => (
          <li key={item.id}>
            <div className="checkpoint-info">
              <strong>{item.name}</strong>
              <small>
                {formatTime(item.createdAt)} · {STAGE_LABELS[item.stage] ?? item.stage} · {item.style} · ฿{new Intl.NumberFormat('th-TH').format(item.budget ?? 0)}
                {item.hasGeneratedImage ? ' · มีภาพ AI' : ''}
              </small>
            </div>
            <div className="checkpoint-actions">
              {confirmId === item.id ? (
                <>
                  <button
                    type="button"
                    className="is-primary"
                    disabled={busyId === item.id}
                    onClick={() => run(async () => { await restoreCheckpoint(projectId, item.id); await onRestored?.() }, `ย้อนกลับไปที่ "${item.name}" แล้ว`, item.id)}
                  >
                    ยืนยันย้อนกลับ
                  </button>
                  <button type="button" onClick={() => setConfirmId('')}>ยกเลิก</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setConfirmId(item.id)}>ย้อนกลับ</button>
                  <button type="button" className="is-danger" disabled={busyId === item.id} onClick={() => run(() => deleteCheckpoint(item.id), 'ลบ Checkpoint แล้ว', item.id)}>ลบ</button>
                </>
              )}
            </div>
          </li>
        ))}
        {!checkpoints.length && !error ? <li className="checkpoint-empty">ยังไม่มี Checkpoint</li> : null}
      </ul>
    </section>
  )
}

export default CheckpointPanel
