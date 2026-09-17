import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { IconChevronDown, IconCheck } from './Icons'

export interface SelectOption<T extends string = string> {
  value: T
  label: string
}

export interface CustomSelectProps<T extends string = string> {
  options: SelectOption<T>[]
  value: T
  onChange: (val: T) => void
  disabled?: boolean
  className?: string
  placeholder?: string
}

export default function CustomSelect<T extends string = string>({
  options,
  value,
  onChange,
  disabled = false,
  className = '',
  placeholder = 'Select option',
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleClickOutside, true)
    document.addEventListener('click', handleClickOutside, true)
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside, true)
      document.removeEventListener('click', handleClickOutside, true)
    }
  }, [open])

  const handleSelect = (val: T, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onChange(val)
    setOpen(false)
  }

  return (
    <div
      className={`custom-select-wrap ${open ? 'select-open' : ''} ${
        disabled ? 'select-disabled' : ''
      } ${className}`}
      ref={ref}
    >
      <button
        type="button"
        className="custom-select-trigger"
        onClick={(e) => {
          e.stopPropagation()
          if (!disabled) setOpen((o) => !o)
        }}
        disabled={disabled}
      >
        <span className="select-val">{selectedOption ? selectedOption.label : placeholder}</span>
        <IconChevronDown size={14} className="select-chevron" />
      </button>

      {open && (
        <div className="custom-select-dropdown">
          {options.map((opt) => (
            <button
              type="button"
              key={opt.value}
              className={`select-option ${opt.value === value ? 'selected' : ''}`}
              onClick={(e) => handleSelect(opt.value, e)}
            >
              <span>{opt.label}</span>
              {opt.value === value && <IconCheck size={14} color="var(--accent)" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
