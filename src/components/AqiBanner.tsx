import { generateClient } from 'aws-amplify/data'
import { useEffect, useState } from 'react'
import type { Schema } from '../../amplify/data/resource'
import { aqiCategory, istDate } from '../../amplify/shared/aqi'
import './geo.css'

type Props = {
  city: string
  /** Seats going the user's way today; shown as the headline on a bad-air day. */
  seatsGoingYourWay?: number
}

const BAD_AIR_RED = '#b00020'
// Dark text only reads on the light CPCB colours.
const DARK_TEXT = new Set(['Good', 'Satisfactory', 'Moderate', 'Poor'])

export function AqiBanner({ city, seatsGoingYourWay }: Props) {
  const [result, setResult] = useState<{
    city: string
    row: Schema['AqiDaily']['type'] | null
    failed: boolean
  }>()

  useEffect(() => {
    let cancelled = false
    generateClient<Schema>()
      .models.AqiDaily.get({ city, date: istDate() })
      .then(({ data, errors }) => {
        if (!cancelled) setResult({ city, row: data, failed: Boolean(errors) })
      })
      .catch(() => {
        if (!cancelled) setResult({ city, row: null, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [city])

  // Nothing to show until the fetch for this city has finished.
  if (result?.city !== city) return null
  const { row, failed } = result
  if (failed || row?.aqi == null) {
    return (
      <div className="aqi-banner" style={{ background: '#f1f3f4', color: '#202124' }}>
        <span className="aqi-banner__detail">Air quality for {city} isn't available yet today.</span>
      </div>
    )
  }

  const { category, color } = aqiCategory(row.aqi)
  const badAir = row.badAir === true
  const background = badAir ? BAD_AIR_RED : color
  const text = !badAir && DARK_TEXT.has(category) ? '#202124' : '#fff'

  return (
    <div className="aqi-banner" role="status" style={{ background, color: text }}>
      {badAir && seatsGoingYourWay !== undefined ? (
        <>
          <span className="aqi-banner__headline">
            {seatsGoingYourWay} seats going your way
          </span>
          <span className="aqi-banner__detail">
            {city} AQI {row.aqi} ({category}). Shared trips earn double points today.
          </span>
        </>
      ) : (
        <>
          <span className="aqi-banner__headline">
            {city} AQI {row.aqi}
          </span>
          <span className="aqi-banner__detail">
            {category}
            {badAir && '. Shared trips earn double points today.'}
          </span>
        </>
      )}
    </div>
  )
}
