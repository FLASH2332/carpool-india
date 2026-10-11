import { useEffect, useId, useRef, useState } from 'react'
import { isLocationConfigured, searchPlaces, type LngLat, type Place } from '../lib/location'
import './geo.css'

type Props = {
  label: string
  /** The chosen place; set it to show a place picked elsewhere (e.g. current location). */
  value?: Place | null
  /** Called with the place the user picks, or null once they edit the text again. */
  onSelect: (place: Place | null) => void
  /** Nudges results towards this point, e.g. the user's city. */
  bias?: LngLat
  placeholder?: string
}

const MIN_CHARS = 3
const DEBOUNCE_MS = 300

export function PlaceAutocomplete({ label, value, onSelect, bias, placeholder }: Props) {
  const id = useId()
  const [text, setText] = useState(value?.label ?? '')
  const [options, setOptions] = useState<Place[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [error, setError] = useState(false)
  const latest = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Show a place chosen elsewhere (adjusting state during render, not in an effect).
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    if (value) setText(value.label)
  }

  function onChange(next: string) {
    setText(next)
    setActive(-1)
    if (value) onSelect(null)
    const request = ++latest.current
    clearTimeout(timer.current)
    if (!isLocationConfigured || next.trim().length < MIN_CHARS) {
      setOptions([])
      return
    }
    timer.current = setTimeout(async () => {
      try {
        const places = await searchPlaces(next.trim(), bias)
        if (request !== latest.current) return
        setError(false)
        setOptions(places)
        setOpen(true)
      } catch {
        if (request === latest.current) setError(true)
      }
    }, DEBOUNCE_MS)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  function pick(place: Place) {
    clearTimeout(timer.current)
    latest.current++
    setText(place.label)
    setOptions([])
    setOpen(false)
    onSelect(place)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((a) => Math.min(a + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && open && options[active]) {
      e.preventDefault()
      pick(options[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const listId = `${id}-list`
  return (
    <div className="place-autocomplete">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
        autoComplete="off"
        value={text}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {error && <p className="place-autocomplete__error">Couldn't search places. Try again.</p>}
      {open && options.length > 0 && (
        <ul id={listId} role="listbox">
          {options.map((place, i) => (
            <li
              key={`${place.label}-${i}`}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: the input's blur would close the list first.
              onMouseDown={(e) => {
                e.preventDefault()
                pick(place)
              }}
            >
              {place.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
