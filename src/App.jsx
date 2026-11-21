// Import React Packages.
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from 'react-oidc-context'
import './App.css'

// Import Components
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'

// Import Images
import trackyLogo from '../Images/tracky-logo.png'

const emptyTime = { hours: '', minutes: '' }

// Local date as YYYY-MM-DD (avoids timezone shifts).
const toDateString = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// YYYY-MM-DD -> local Date (no timezone shift).
const fromDateString = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// "21/11/2026" style, with weekday.
const prettyDate = (s) =>
  fromDateString(s).toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
  })

// { hours, minutes } -> total minutes, or null if the field was left blank.
const toMinutes = (t) => {
  if (!t || (t.hours === '' && t.minutes === '')) return null
  return (Number(t.hours) || 0) * 60 + (Number(t.minutes) || 0)
}

// Total minutes -> "7h 05m".
const fmtMinutes = (mins) => {
  if (mins == null || Number.isNaN(mins)) return '-'
  const rounded = Math.round(mins)
  const h = Math.floor(rounded / 60)
  const m = String(rounded % 60).padStart(2, '0')
  return `${h}h ${m}m`
}

// { hours, minutes } -> "07:30" (for clock times).
const fmtClock = (t) => {
  const mins = toMinutes(t)
  if (mins == null) return '-'
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

// Miles driven that day, or null if it can't be worked out.
const milesFor = (d) => {
  if (d.startMiles === '' || d.finishMiles === '' || d.startMiles == null || d.finishMiles == null) return null
  const diff = Number(d.finishMiles) - Number(d.startMiles)
  return diff >= 0 ? diff : null
}

// Total of the non-null values in a list.
const sum = (values) => values.reduce((a, b) => a + (b ?? 0), 0)

// Reusable hours+minutes field (used for durations AND clock times).
function TimeField({ title, hoursMax, value, onChange, idPrefix, className = '' }) {
  return (
    <div className={`field-block ${className}`}>
      <h3>{title}</h3>
      <div className='hours-select-div'>
        <div className='hours-row'>
          <p>Hours:</p>
          <select
            className="time-select"
            id={`${idPrefix}-hours`}
            value={value.hours}
            onChange={(e) => onChange({ ...value, hours: e.target.value })}
          >
            <option value="">Hrs</option>
            {[...Array(hoursMax)].map((_, i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </div>

        <div className='hours-row'>
          <p>Minutes:</p>
          <select
            className="time-select"
            id={`${idPrefix}-minutes`}
            value={value.minutes}
            onChange={(e) => onChange({ ...value, minutes: e.target.value })}
          >
            <option value="">Min</option>
            {[...Array(60)].map((_, i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

// Reusable single-number field (used for miles).
function MilesField({ title, value, onChange, idPrefix }) {
  return (
    <div className='field-block'>
      <h3>{title}</h3>
      <div className='hours-row'>
        <p>Miles:</p>
        <input
          type="number"
          min="0"
          className="miles-input"
          id={idPrefix}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  )
}

function App() {
  const auth = useAuth()

  // Date for the whole entry.
  const [startDate, setStartDate] = useState(new Date())

  // Duration-type fields.
  const [rest, setRest] = useState(emptyTime)
  const [workTime, setWorkTime] = useState(emptyTime)
  const [driveTime, setDriveTime] = useState(emptyTime)

  // Clock-type fields.
  const [cardIn, setCardIn] = useState(emptyTime)
  const [cardOut, setCardOut] = useState(emptyTime)
  const [startTime, setStartTime] = useState(emptyTime)
  const [finishTime, setFinishTime] = useState(emptyTime)

  // Miles fields.
  const [startMiles, setStartMiles] = useState('')
  const [finishMiles, setFinishMiles] = useState('')

  // Message under the Submit button.
  const [status, setStatus] = useState('')

  // Total Hours + History: how many days back to look, the rows, and a refresh counter.
  const [rangeDays, setRangeDays] = useState(7)
  const [history, setHistory] = useState([])
  const [historyStatus, setHistoryStatus] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const dateString = toDateString(startDate)
  const isAuthed = auth.isAuthenticated
  const token = auth.user?.access_token

  // LOADING (single day): runs whenever the date changes, fills the form with what was saved.
  useEffect(() => {
    if (!isAuthed) return
    let cancelled = false
    setStatus('')

    fetch(`/api/logs?from=${dateString}&to=${dateString}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('load failed')
        return res.json()
      })
      .then((rows) => {
        if (cancelled) return
        const d = rows[0]?.data
        setCardIn(d?.cardIn ?? emptyTime)
        setCardOut(d?.cardOut ?? emptyTime)
        setStartTime(d?.startTime ?? emptyTime)
        setFinishTime(d?.finishTime ?? emptyTime)
        setWorkTime(d?.workTime ?? emptyTime)
        setDriveTime(d?.driveTime ?? emptyTime)
        setRest(d?.rest ?? emptyTime)
        setStartMiles(d?.startMiles ?? '')
        setFinishMiles(d?.finishMiles ?? '')
      })
      .catch(() => {
        if (!cancelled) setStatus('Could not load this day.')
      })

    return () => { cancelled = true }
  }, [dateString, isAuthed])

  // LOADING (range): fills Total Hours and History. Re-runs when the range
  // changes or after a save (refreshKey).
  useEffect(() => {
    if (!isAuthed) return
    let cancelled = false
    setHistoryStatus('')

    const today = new Date()
    const from = new Date()
    from.setDate(today.getDate() - (rangeDays - 1))

    fetch(`/api/logs?from=${toDateString(from)}&to=${toDateString(today)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('load failed')
        return res.json()
      })
      .then((rows) => {
        if (cancelled) return
        // Newest first for the history list.
        setHistory([...rows].sort((a, b) => b.log_date.localeCompare(a.log_date)))
      })
      .catch(() => {
        if (!cancelled) setHistoryStatus('Could not load history.')
      })

    return () => { cancelled = true }
  }, [isAuthed, rangeDays, refreshKey])

  // Totals worked out from the history rows.
  const totals = useMemo(() => {
    const entries = history.map((r) => r.data)
    return {
      days: entries.length,
      work: sum(entries.map((d) => toMinutes(d.workTime))),
      drive: sum(entries.map((d) => toMinutes(d.driveTime))),
      rest: sum(entries.map((d) => toMinutes(d.rest))),
      miles: sum(entries.map(milesFor)),
    }
  }, [history])

  // SAVING: runs when Submit is pressed.
  const handleSubmit = async () => {
    setStatus('Saving...')
    try {
      const res = await fetch(`/api/logs/${dateString}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        // THE PARCEL: all the form values packed up and sent to the API
        body: JSON.stringify({ cardIn, cardOut, startTime, finishTime, workTime, driveTime, rest, startMiles, finishMiles }),
      })
      if (!res.ok) throw new Error('save failed')
      setStatus('Saved')
      setRefreshKey((k) => k + 1) // reload totals + history
    } catch {
      setStatus('Could not save. Please try again.')
    }
  }

  // Login screens.
  if (auth.isLoading) {
    return <div className='content-div'><p>Loading...</p></div>
  }

  if (auth.error) {
    return (
      <div className='content-div'>
        <p>Login problem: {auth.error.message}</p>
        <button className="submit-button" onClick={() => auth.signinRedirect()}>Try again</button>
      </div>
    )
  }

  if (!auth.isAuthenticated) {
    return (
      <div className='content-div'>
        <div className='title' id='title-div'>
          <img src={trackyLogo} alt="Tracky" className="tracky-logo" />
        </div>
        <button className="submit-button" onClick={() => auth.signinRedirect()}>Log in</button>
      </div>
    )
  }

  const rangeButtons = (
    <div className="range-buttons">
      {[7, 14].map((n) => (
        <button
          key={n}
          type="button"
          className={`range-button ${rangeDays === n ? 'active' : ''}`}
          onClick={() => setRangeDays(n)}
        >
          {n} days
        </button>
      ))}
    </div>
  )

  return (
    <>
    <div className='content-div'>
      <div className='title' id='title-div'>
        <img src={trackyLogo} alt="Tracky" className="tracky-logo" />
        <button className="logout-button" onClick={() => auth.signoutRedirect()}>Log out</button>
      </div>

      <div className='top' id='top-div'>
        <div className="top-heading">
          <h1>Enter Information</h1>
        </div>

        <DatePicker
          selected={startDate}
          onChange={(date) => setStartDate(date)}
          dateFormat="dd/MM/yyyy"
          calendarStartDay={1}
          className='top-div-dateselector'
        />

      <div className='fields-grid'>
        <TimeField title="Card In" hoursMax={24} value={cardIn} onChange={setCardIn} idPrefix="card-in" />
        <TimeField title="Card Out" hoursMax={24} value={cardOut} onChange={setCardOut} idPrefix="card-out" />

        <TimeField title="Start Time" hoursMax={24} value={startTime} onChange={setStartTime} idPrefix="start-time" />
        <MilesField title="Start Miles" value={startMiles} onChange={setStartMiles} idPrefix="start-miles" />

        <TimeField title="Finish Time" hoursMax={24} value={finishTime} onChange={setFinishTime} idPrefix="finish-time" />
        <MilesField title="Finish Miles" value={finishMiles} onChange={setFinishMiles} idPrefix="finish-miles" />

        <TimeField title="Work Time" hoursMax={25} value={workTime} onChange={setWorkTime} idPrefix="work-time" />
        <TimeField title="Drive Time" hoursMax={25} value={driveTime} onChange={setDriveTime} idPrefix="drive-time" />

        <TimeField title="Rest" hoursMax={13} value={rest} onChange={setRest} idPrefix="rest" className="full-width" />
      </div>
        <button type="button" className="submit-button" onClick={handleSubmit}>Submit</button>
        <p className="status-message">{status}</p>
      </div>

      <div className='middle' id='middle-div'>
        <h1>Total Hours</h1>
        {rangeButtons}
        {historyStatus ? (
          <p className="status-message">{historyStatus}</p>
        ) : totals.days === 0 ? (
          <p className="status-message">No entries in the last {rangeDays} days.</p>
        ) : (
          <>
            <p className="days-logged">{totals.days} {totals.days === 1 ? 'day' : 'days'} logged</p>
            <div className="stats-grid">
              <div className="stat-card"><span className="stat-label">Work</span><span className="stat-value">{fmtMinutes(totals.work)}</span></div>
              <div className="stat-card"><span className="stat-label">Drive</span><span className="stat-value">{fmtMinutes(totals.drive)}</span></div>
              <div className="stat-card"><span className="stat-label">Rest</span><span className="stat-value">{fmtMinutes(totals.rest)}</span></div>
              <div className="stat-card"><span className="stat-label">Miles</span><span className="stat-value">{totals.miles}</span></div>
            </div>
          </>
        )}
      </div>

      <div className='bottom' id='bottom-div'>
        <h1>History</h1>
        {history.length === 0 ? (
          <p className="status-message">Nothing to show yet.</p>
        ) : (
          <div className="history-scroll">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Card in/out</th>
                  <th>Work</th>
                  <th>Drive</th>
                  <th>Rest</th>
                  <th>Miles</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => {
                  const d = row.data
                  const miles = milesFor(d)
                  return (
                    <tr
                      key={row.log_date}
                      className={row.log_date === dateString ? 'selected' : ''}
                      onClick={() => setStartDate(fromDateString(row.log_date))}
                      title="Click to edit this day"
                    >
                      <td>{prettyDate(row.log_date)}</td>
                      <td>{fmtClock(d.cardIn)} - {fmtClock(d.cardOut)}</td>
                      <td>{fmtMinutes(toMinutes(d.workTime))}</td>
                      <td>{fmtMinutes(toMinutes(d.driveTime))}</td>
                      <td>{fmtMinutes(toMinutes(d.rest))}</td>
                      <td>{miles == null ? '-' : miles}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    </>
  )
}

export default App