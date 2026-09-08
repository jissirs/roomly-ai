import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import LandHeader from '../../components/LandHeader/LandHeader'
import uploadRoomImage from '../../assets/steps/upload-room.png'
import aiDecisionsImage from '../../assets/steps/ai-decisions.png'
import shopProductsImage from '../../assets/steps/shop-products.png'
import './LandingPage.css'

function Reveal({ children, as: Tag = 'div', className = '', ...rest }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.2 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <Tag ref={ref} className={`reveal ${visible ? 'is-visible' : ''} ${className}`.trim()} {...rest}>
      {children}
    </Tag>
  )
}

const STEPS = [
  {
    number: '01',
    title: 'อัปโหลดห้อง',
    description: 'ถ่ายรูปห้องจริงของคุณ แล้วเลือก Style และงบประมาณที่ต้องการ',
    image: uploadRoomImage,
    imageAlt: 'กำลังถ่ายรูปห้องนั่งเล่นด้วยโทรศัพท์เพื่ออัปโหลดเข้าสู่ Roomly AI',
  },
  {
    number: '02',
    title: 'AI ตัดสินใจให้',
    description: 'ระบบวิเคราะห์และแนะนำ Keep / Replace / Remove พร้อมเหตุผลที่อธิบายได้',
    image: aiDecisionsImage,
    imageAlt: 'AI วิเคราะห์เฟอร์นิเจอร์ในห้องและแนะนำให้เก็บ เปลี่ยน หรือนำออก',
  },
  {
    number: '03',
    title: 'ซื้อของจริงได้เลย',
    description: 'กดจุดบนภาพเพื่อดูสินค้าที่ match พร้อมลิงก์ไปยังร้านค้าโดยตรง',
    image: shopProductsImage,
    imageAlt: 'โซฟาและของแต่งห้องที่แนะนำพร้อมเลือกซื้อจากร้านค้า',
  },
]

const STATS = [
  { value: '50–150+', label: 'สินค้าให้เลือกจริง' },
  { value: 'Keep / Replace / Remove', label: 'ตัดสินใจอย่างมีเหตุผล' },
  { value: '100%', label: 'อยู่ในงบที่กำหนด' },
]

function LandingPage() {
  return (
    <div className="landing">
      <LandHeader />

      <main id="top">
        <section className="landing-hero">
          <div className="landing-hero-overlay" />
          <div className="landing-hero-content">
            <p className="landing-eyebrow">AI Interior Decision Platform</p>
            <h1 className="landing-hero-title">
              แต่งห้องในฝันของคุณ
              <br />
              ให้อยู่ในงบที่ใช่
            </h1>
            <p className="landing-hero-subtitle">
              ไม่ได้แค่เห็นว่าห้องสวยแบบไหน แต่รู้ว่าควรเก็บอะไร เปลี่ยนอะไร
              ซื้ออะไร และรวมแล้วอยู่ในงบหรือไม่
            </p>
          </div>

          
        </section>

        <Reveal as="section" className="landing-stats">
          {STATS.map((stat, index) => (
            <div className="landing-stat" key={stat.label}>
              <p className="landing-stat-value">{stat.value}</p>
              <p className="landing-stat-label">{stat.label}</p>
              {index < STATS.length - 1 && (
                <span className="landing-stat-divider" aria-hidden="true" />
              )}
            </div>
          ))}
        </Reveal>

        <Reveal as="section" id="how-it-works" className="landing-steps">
          <p className="landing-section-eyebrow">วิธีใช้งาน</p>
          <h2 className="landing-section-title">จากรูปห้อง 1 รูป สู่ห้องในฝัน</h2>

          <div className="landing-steps-grid">
            {STEPS.map((step) => (
              <div className="landing-step" key={step.number}>
                <div className="landing-step-image-wrap">
                  <img
                    src={step.image}
                    alt={step.imageAlt}
                    loading="lazy"
                    className="landing-step-image"
                  />
                </div>
                <span className="landing-step-number">{step.number}</span>
                <h3 className="landing-step-title">{step.title}</h3>
                <p className="landing-step-description">{step.description}</p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal as="section" id="value" className="landing-value">
          <blockquote className="landing-value-quote">
            “ไม่ใช่แค่ AI แต่งห้อง แต่คือ AI
            ที่ช่วยตัดสินใจว่าจะจัดห้องนี้อย่างไรภายใต้งบที่มีจริง”
          </blockquote>
        </Reveal>

        <Reveal as="section" id="showcase" className="landing-cta">
          <h2 className="landing-cta-title">เริ่มต้นแต่งห้องของคุณวันนี้</h2>
          <p className="landing-cta-subtitle">
            อัปโหลดรูปห้อง เลือกสไตล์ที่ชอบ แล้วให้ Roomly AI ช่วยตัดสินใจแทนคุณ
          </p>
          <Link to="/register" className="landing-btn landing-btn-primary landing-btn-lg">
            เริ่มออกแบบ
          </Link>
        </Reveal>
      </main>

      <footer className="landing-footer">
        <span className="landing-logo landing-logo-small">ROOMLY AI</span>
        <p className="landing-footer-text">
          © {new Date().getFullYear()} Roomly AI — AI Interior Decision Platform
        </p>
      </footer>
    </div>
  )
}

export default LandingPage
