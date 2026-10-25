// Import React Packages.
import { useState, useEffect } from 'react'
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

  const dateString = toDateString(startDate)
  const isAuthed = auth.isAuthenticated

  // LOADING: runs whenever the date changes, fills the form with what was saved.
  useEffect(() => {
    if (!isAuthed) return
    let cancelled = false
    setStatus('')

    fetch(`/api/logs?from=${dateString}&to=${dateString}`, {
      headers: { Authorization: `Bearer ${auth.user.access_token}` },
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

  // SAVING: runs when Submit is pressed.
  const handleSubmit = async () => {
    setStatus('Saving...')
    try {
      const res = await fetch(`/api/logs/${dateString}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.user.access_token}`,
        },
        // THE PARCEL: all the form values packed up and sent to the API
        body: JSON.stringify({ cardIn, cardOut, startTime, finishTime, workTime, driveTime, rest, startMiles, finishMiles }),
      })
      if (!res.ok) throw new Error('save failed')
      setStatus('Saved')
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
        <h1>Average Hours</h1>
      </div>

      <div className='bottom' id='bottom-div'>
        <h1>History</h1>
      </div>
    </div>
    </>
  )
}

export default App