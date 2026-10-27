export default function AngleTabs({ tabs, activeIndex, onChange }) {
  if (tabs.length < 2) return null
  return (
    <div className="angle-tabs" role="tablist" aria-label="เลือกมุมห้อง">
      {tabs.map((tab, index) => (
        <button
          className={`angle-tab ${index === activeIndex ? 'is-active' : ''} ${tab.done ? 'is-done' : ''}`.trim()}
          type="button"
          role="tab"
          aria-selected={index === activeIndex}
          onClick={() => onChange(index)}
          key={tab.key}
        >
          <span>{String(index + 1).padStart(2, '0')}</span>
          <strong>{index === 0 ? 'มุมหลัก' : `มุม ${index + 1}`}</strong>
          <small>{tab.status}</small>
        </button>
      ))}
    </div>
  )
}
