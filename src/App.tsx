import { useState, useRef, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { 
  LogOut, Camera, CheckCircle, AlertCircle, 
  Bluetooth, Users, FileText, MapPin, Clock, User, Lock, 
  Home, Play, Pause, Plus, Eye, EyeOff, Loader, Download
} from 'lucide-react'
import './App.css'
import { ToastProvider, useToast } from './components/Toast'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3002').replace(/\/$/, '')
const apiUrl = (path: string) => `${API_BASE_URL}${path}`

type UserRole = 'student' | 'faculty' | null
type Screen = 'role-select' | 'login' | 'faculty-dashboard' | 'student-dashboard' | 'biometric-enroll'

interface User {
  id: number
  name: string
  role: UserRole
  email?: string
  enrollment_no?: string
  department?: string
  semester?: string
  division?: string
}

interface Subject {
  id: number
  subject_name: string
  faculty_id: number
}

interface BLEBeacon {
  id: string
  name?: string
  facultyName: string
  subjectCode: string
  sessionId: string
  device: BluetoothDevice
}

interface RequestDeviceOptions {
  filters?: BluetoothLEScanFilter[]
  optionalServices?: string[]
  acceptAllDevices?: boolean
}

interface BluetoothLEScanFilter {
  services?: string[]
  name?: string
  namePrefix?: string
}

interface BluetoothDevice {
  id?: string
  name?: string
  gatt?: BluetoothRemoteGATTServer
}

interface BluetoothRemoteGATTServer {
  connect(): Promise<BluetoothRemoteGATTServer>
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>
}

interface BluetoothRemoteGATTCharacteristic {
  readValue(): Promise<DataView>
  writeValue(value: BufferSource): Promise<void>
}

declare global {
  interface Navigator {
    bluetooth: {
      requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>
    }
  }
}

function AppContent() {
  const [userRole, setUserRole] = useState<UserRole>(null)
  const [currentScreen, setCurrentScreen] = useState<Screen>('role-select')
  const [user, setUser] = useState<User | null>(null)
  const toast = useToast()

  const handleRoleSelect = (role: UserRole) => {
    setUserRole(role)
    setCurrentScreen('login')
  }

  const handleLogin = (userData: User) => {
    setUser(userData)
    if (userData.role === 'faculty') {
      setCurrentScreen('faculty-dashboard')
      toast.addToast(`Welcome back, ${userData.name}!`, 'success', 3000)
    } else {
      setCurrentScreen('student-dashboard')
      toast.addToast(`Welcome, ${userData.name}!`, 'success', 3000)
    }
  }

  const handleBiometricEnroll = () => {
    setCurrentScreen('biometric-enroll')
  }

  const getBiometricCompleteScreen = () => {
    return userRole === 'faculty' ? 'faculty-dashboard' : 'student-dashboard'
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    setUser(null)
    setUserRole(null)
    setCurrentScreen('role-select')
    toast.addToast('Logged out successfully', 'info', 3000)
  }

  return (
    <div className="app">
      {currentScreen === 'role-select' && <RoleSelectScreen onRoleSelect={handleRoleSelect} />}
      {currentScreen === 'login' && <LoginScreen role={userRole} onLogin={handleLogin} />}
      {currentScreen === 'faculty-dashboard' && user && <FacultyDashboard user={user} onLogout={handleLogout} />}
      {currentScreen === 'student-dashboard' && user && <StudentDashboard user={user} onBiometricEnroll={handleBiometricEnroll} onLogout={handleLogout} />}
      {currentScreen === 'biometric-enroll' && user && <BiometricEnrollScreen onComplete={() => setCurrentScreen(getBiometricCompleteScreen())} />}
    </div>
  )
}

function RoleSelectScreen({ onRoleSelect }: { onRoleSelect: (role: UserRole) => void }) {
  return (
    <div className="screen role-select-screen">
      <img src="/LAS-Logo.png" alt="LAS Logo" className="logo-large" />
      <h1>LDCE Acadmic System</h1>
      <p>Attendance Manager</p>
      <div className="role-buttons">
        <button onClick={() => onRoleSelect('faculty')} className="role-button faculty-btn">
          <FileText size={24} />
          <span>Faculty</span>
        </button>
        <button onClick={() => onRoleSelect('student')} className="role-button student-btn">
          <Users size={24} />
          <span>Student</span>
        </button>
      </div>
    </div>
  )
}

function LoginScreen({ role, onLogin }: { role: UserRole, onLogin: (user: User) => void }) {
  const [identifier, setIdentifier] = useState(role === 'student' ? '200001' : 'faculty.01@cse.institute.edu')
  const [password, setPassword] = useState(role === 'student' ? 'password123' : 'faculty123')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const toast = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const endpoint = role === 'faculty' ? '/api/auth/faculty-login' : '/api/auth/student-login'
      const payload = role === 'faculty'
        ? { email: identifier, password }
        : { enrollment_no: identifier, password }

      const response = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (response.ok) {
        const userData = await response.json()
        localStorage.setItem('token', userData.token)
        onLogin({ ...userData.user || userData.faculty || userData.student, role })
      } else {
        toast.addToast('Login failed. Check your credentials.', 'error', 4000)
      }
    } catch {
      // Backend is down: gracefully fall back to Demo Mode login
      toast.addToast('Backend offline. Demo Mode activated.', 'warning', 4000)
      localStorage.setItem('token', 'demo-token-12345')
      if (role === 'faculty') {
        onLogin({ id: 1, name: 'Demo Faculty', email: identifier, department: 'Demo Dept', role })
      } else {
        onLogin({ id: 1, name: 'Demo Student', enrollment_no: identifier, department: 'Demo Dept', semester: '4', division: 'A', role })
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen login-screen">
      <img src="/LAS-Logo.png" alt="LAS Logo" className="logo-small" />
      <h1>{role === 'faculty' ? 'Faculty' : 'Student'} Login</h1>
      <form onSubmit={handleSubmit} className="login-form">
        <div className="form-group">
          <label className="label-with-icon">
            <User size={16} /> {role === 'faculty' ? 'Email' : 'Enrollment'}
          </label>
          <input
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder={role === 'faculty' ? 'faculty.01@cse.institute.edu' : '200001'}
            required
            className="form-input"
          />
        </div>
        <div className="form-group">
          <label className="label-with-icon">
            <Lock size={16} /> Password
          </label>
          <div className="password-input-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="form-input"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={loading} className="btn-primary btn-full">
          {loading ? (
            <>
              <Loader size={18} className="spin" /> Signing in...
            </>
          ) : (
            <>
              <CheckCircle size={18} /> Sign In
            </>
          )}
        </button>
        <button type="button" onClick={() => window.location.reload()} className="btn-secondary btn-full">
          <AlertCircle size={18} /> Back
        </button>
      </form>
    </div>
  )
}

function FacultyDashboard({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null)
  const [sessionData, setSessionData] = useState({
    lectureNo: '',
    date: new Date().toISOString().split('T')[0],
    department: user.department || '',
    semester: user.semester || '',
    division: user.division || ''
  })
  const [beacons, setBeacons] = useState<BLEBeacon[]>([])
  const [configuredBeacons, setConfiguredBeacons] = useState<Set<string>>(new Set())
  const [scanning, setScanning] = useState(false)
  const [sessionStarted, setSessionStarted] = useState(false)
  const [currentSessionId] = useState<string>(`sess_${Date.now()}`)
  const [attendanceList, setAttendanceList] = useState<any[]>([])
  const [demoMode, setDemoMode] = useState(false)
  const toast = useToast()

  useEffect(() => {
    fetch(apiUrl('/api/faculty/subjects'), {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    })
      .then(res => res.json())
      .then(data => setSubjects(data.subjects || []))
      .catch(() => {
        // Silently handle if backend is unreachable
      })
  }, [])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null
    if (sessionStarted) {
      const fetchAttendance = async () => {
        try {
          const res = await fetch(apiUrl(`/api/attendance/${currentSessionId}`), {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          })
          if (res.ok) {
            const data = await res.json()
            setAttendanceList(data.attendance || [])
          }
        } catch {
          // Stop polling if the connection drops to avoid spamming the console
          if (interval) {
            clearInterval(interval)
            toast.addToast('Connection lost. Live updates paused.', 'warning', 3000)
          }
        }
      }
      fetchAttendance()
      interval = setInterval(fetchAttendance, 3000)
    }
    return () => { if (interval) clearInterval(interval) }
  }, [sessionStarted, currentSessionId])

  const scanForBeacons = async () => {
    setScanning(true)
    try {
      // Demo Mode: Create mock beacon for testing
      if (demoMode) {
        await new Promise(resolve => setTimeout(resolve, 1500)) // Simulate scan time
        const mockBeacon: BLEBeacon = {
          id: `beacon_demo_${Date.now()}`,
          name: 'LAS_Demo_Beacon_001',
          facultyName: 'Demo Faculty',
          subjectCode: 'CS101',
          sessionId: `demo_${Date.now()}`,
          device: {} as any
        }
        setBeacons(prev => [...prev, mockBeacon])
        toast.addToast(`Demo beacon added: ${mockBeacon.name}`, 'success', 3000)
        setScanning(false)
        return
      }

      // Real Bluetooth Mode
      if (!navigator.bluetooth) {
        toast.addToast('Bluetooth not supported. Enable Demo Mode to test.', 'warning', 3000)
        setScanning(false)
        return
      }

      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['12345678-1234-1234-1234-123456789abc']
      })

      if (device.gatt) {
        const server = await device.gatt.connect()
        const service = await server.getPrimaryService('12345678-1234-1234-1234-123456789abc')
        const characteristic = await service.getCharacteristic('abcd1234-5678-1234-5678-abcdef123456')

        if (characteristic) {
          const value = await characteristic.readValue()
          const sessionData = new TextDecoder().decode(value).replace(/\0/g, '').trim()

          let facultyName = 'Unknown'
          let subjectCode = 'Unknown'
          let sessionId = ''

          if (sessionData && sessionData !== 'READY') {
            const parts = sessionData.split('|')
            facultyName = parts[1] || 'Unknown'
            subjectCode = parts[2] || 'Unknown'
            sessionId = parts[3] || ''
          }

          const beaconInfo: BLEBeacon = {
            id: device.id || `beacon_${Date.now()}`,
            name: device.name || (sessionData === 'READY' ? 'New ESP32 Beacon' : `LAS_${facultyName}_001`),
            facultyName: sessionData === 'READY' ? 'Unconfigured' : facultyName,
            subjectCode: sessionData === 'READY' ? 'Unconfigured' : subjectCode,
            sessionId,
            device
          }

          setBeacons(prev => [...prev.filter(b => b.id !== beaconInfo.id), beaconInfo])
          toast.addToast(`Beacon found: ${beaconInfo.name}`, 'info', 3000)
        }
      }
    } catch (error) {
      if (error instanceof Error && !error.message.includes('User cancelled')) {
        toast.addToast('Failed to scan for beacons. Try Demo Mode.', 'warning', 3000)
      }
    } finally {
      setScanning(false)
    }
  }

  const configureBeacon = async (beacon: BLEBeacon) => {
    if (!selectedSubject) {
      toast.addToast('Select a subject first', 'warning', 2000)
      return
    }

    try {
      // Demo Mode: Instant configuration
      if (demoMode) {
        await new Promise(resolve => setTimeout(resolve, 800)) // Simulate config time
        setConfiguredBeacons(prev => new Set([...prev, beacon.id]))
        setBeacons(prev => prev.map(b => b.id === beacon.id ? {
          ...b,
          facultyName: user.name,
          subjectCode: selectedSubject.subject_name,
          sessionId: currentSessionId
        } : b))
        toast.addToast(`Beacon paired: ${beacon.name}`, 'success', 2000)
        return
      }

      // Real Bluetooth Mode
      const sessionDataString = `${user.id}|${user.name}|${selectedSubject.subject_name}|${currentSessionId}`
      const server = await beacon.device.gatt!.connect()
      const service = await server.getPrimaryService('12345678-1234-1234-1234-123456789abc')
      const characteristic = await service.getCharacteristic('abcd1234-5678-1234-5678-abcdef123456')

      const encoder = new TextEncoder()
      const encodedData = encoder.encode(sessionDataString)
      await characteristic.writeValue(encodedData)

      await new Promise(resolve => setTimeout(resolve, 500))
      const verifyValue = await characteristic.readValue()
      const verifyData = new TextDecoder().decode(verifyValue)

      if (verifyData === sessionDataString) {
        setConfiguredBeacons(prev => new Set([...prev, beacon.id]))
        setBeacons(prev => prev.map(b => b.id === beacon.id ? {
          ...b,
          facultyName: user.name,
          subjectCode: selectedSubject.subject_name,
          sessionId: currentSessionId
        } : b))
        toast.addToast(`Beacon paired: ${beacon.name}`, 'success', 3000)
      }
    } catch {
      toast.addToast('Failed to configure beacon', 'error', 3000)
    }
  }

  const startSession = async () => {
    if (!selectedSubject || !sessionData.lectureNo || !sessionData.department || !sessionData.semester || !sessionData.division) {
      toast.addToast('Fill all required fields', 'warning', 2000)
      return
    }

    if (configuredBeacons.size === 0) {
      toast.addToast('Configure at least one beacon', 'warning', 2000)
      return
    }

    try {
      const response = await fetch(apiUrl('/api/bluetooth/session/start'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          session_id: currentSessionId,
          subject_id: selectedSubject.id,
          lecture_no: parseInt(sessionData.lectureNo),
          department: sessionData.department,
          semester: sessionData.semester,
          division: sessionData.division,
          date: sessionData.date
        })
      })

      if (demoMode || response.ok) {
        setSessionStarted(true)
        if (demoMode) localStorage.setItem('demo_active_session', currentSessionId)
        toast.addToast('Session started', 'success', 3000)
      } else {
        const error = await response.json()
        toast.addToast(error.error || 'Failed to start', 'error', 3000)
      }
    } catch {
      toast.addToast('Network error', 'error', 3000)
    }
  }

  const stopSession = async () => {
    // 1. Tell backend to stop accepting attendance
    try {
      await fetch(apiUrl('/api/bluetooth/session/stop'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ session_id: currentSessionId })
      })
    } catch {
      // ignore network errors if backend is offline
    }

    // 2. Reset the hardware beacons so they stop broadcasting this session
    if (demoMode) {
      localStorage.removeItem('demo_active_session')
    } else {
      for (const beacon of beacons) {
        if (configuredBeacons.has(beacon.id) && beacon.device && beacon.device.gatt) {
          try {
            const server = await beacon.device.gatt.connect()
            const service = await server.getPrimaryService('12345678-1234-1234-1234-123456789abc')
            const characteristic = await service.getCharacteristic('abcd1234-5678-1234-5678-abcdef123456')
            await characteristic.writeValue(new TextEncoder().encode('READY'))
          } catch (error) {
            console.error('Failed to reset physical beacon:', error)
          }
        }
      }
    }

    setSessionStarted(false)
    setConfiguredBeacons(new Set())
    setBeacons([])
    toast.addToast('Session stopped and beacons reset', 'info', 3000)
  }

  const exportToExcel = () => {
    if (attendanceList.length === 0) {
      toast.addToast('No attendance records to export', 'warning', 2000)
      return
    }

    const exportData = attendanceList.map((record: { enrollment_no: string; student_name: string; timestamp: string }) => ({
      Enrollment: record.enrollment_no,
      Name: record.student_name,
      Semester: sessionData.semester,
      Branch: sessionData.department,
      Division: sessionData.division,
      Subject: selectedSubject?.subject_name || 'Unknown',
      Date: sessionData.date || new Date().toLocaleDateString(),
      Timestamp: new Date(record.timestamp).toLocaleString()
    }))

    const worksheet = XLSX.utils.json_to_sheet(exportData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance')
    
    const fileName = `Attendance_${sessionData.department}_Sem${sessionData.semester}_Div${sessionData.division}_${sessionData.date || 'Export'}.xlsx`
    XLSX.writeFile(workbook, fileName)
    toast.addToast('Exported to Excel successfully', 'success', 3000)
  }

  return (
    <div className="screen faculty-dashboard">
      <div className="dashboard-header">
        <div className="header-content">
          <h1>{user.name}</h1>
          <p className="header-subtitle">{user.department || 'Faculty'}</p>
        </div>
        <button onClick={onLogout} className="btn-logout" title="Logout">
          <LogOut size={20} />
        </button>
      </div>

      <div className="dashboard-section">
        <h2>Start Attendance Session</h2>
        <div className="form-grid">
          <div className="form-group">
            <label className="label-with-icon"><FileText size={14} /> Subject</label>
            <select onChange={(e) => setSelectedSubject(subjects.find(s => s.id === parseInt(e.target.value)) || null)} className="form-input">
              <option value="">Select Subject</option>
              {subjects.map(subject => (
                <option key={subject.id} value={subject.id}>{subject.subject_name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="label-with-icon"><Plus size={14} /> Lecture</label>
            <input type="number" placeholder="1" value={sessionData.lectureNo} onChange={(e) => setSessionData({...sessionData, lectureNo: e.target.value})} className="form-input" />
          </div>
          <div className="form-group">
            <label className="label-with-icon"><Home size={14} /> Department</label>
            <input type="text" placeholder="CSE" value={sessionData.department} onChange={(e) => setSessionData({...sessionData, department: e.target.value})} className="form-input" required />
          </div>
          <div className="form-group">
            <label className="label-with-icon"><Users size={14} /> Semester</label>
            <input type="text" placeholder="4" value={sessionData.semester} onChange={(e) => setSessionData({...sessionData, semester: e.target.value})} className="form-input" required />
          </div>
          <div className="form-group">
            <label className="label-with-icon"><FileText size={14} /> Division</label>
            <input type="text" placeholder="A" value={sessionData.division} onChange={(e) => setSessionData({...sessionData, division: e.target.value})} className="form-input" required />
          </div>
          <div className="form-group">
            <label className="label-with-icon"><Clock size={14} /> Date</label>
            <input type="date" value={sessionData.date} onChange={(e) => setSessionData({...sessionData, date: e.target.value})} className="form-input" />
          </div>
        </div>

        <div className="beacons-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bluetooth size={18} /> ESP32 Beacon Setup
            </h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
              <input 
                type="checkbox" 
                checked={demoMode} 
                onChange={(e) => {
                  setDemoMode(e.target.checked)
                  setBeacons([])
                  setConfiguredBeacons(new Set())
                  toast.addToast(e.target.checked ? 'Demo Mode enabled' : 'Demo Mode disabled', 'info', 2000)
                }} 
                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
              />
              Demo
            </label>
          </div>
          <p className="section-hint">1. Scan | 2. Configure | 3. Start session {demoMode && '(Demo Mode)'}</p>
          
          {beacons.length === 0 && !scanning && (
            <div className="empty-state">
              <AlertCircle size={32} />
              <p>No beacons found. Click scan button.</p>
            </div>
          )}
          
          {beacons.map(beacon => (
            <div key={beacon.id} className="beacon-card" onClick={() => configureBeacon(beacon)}>
              <div className="beacon-header">
                <h4>{beacon.name}</h4>
                <span className={`badge ${configuredBeacons.has(beacon.id) ? 'badge-success' : 'badge-info'}`}>
                  {configuredBeacons.has(beacon.id) ? 'Paired' : 'Setup'}
                </span>
              </div>
              <div className="beacon-details">
                <p><strong>Faculty:</strong> {beacon.facultyName}</p>
                <p><strong>Subject:</strong> {beacon.subjectCode}</p>
              </div>
              {!configuredBeacons.has(beacon.id) && (
                <button onClick={(e) => {e.stopPropagation(); configureBeacon(beacon)}} className="btn-primary btn-small">
                  <Bluetooth size={14} /> Configure
                </button>
              )}
            </div>
          ))}

          <button onClick={scanForBeacons} disabled={scanning} className="btn-secondary btn-full">
            {scanning ? (
              <>
                <Loader size={16} className="spin" /> Scanning...
              </>
            ) : (
              <>
                <Bluetooth size={16} /> Scan Beacons
              </>
            )}
          </button>
        </div>

        {sessionStarted ? (
          <button onClick={stopSession} className="btn-danger btn-full btn-lg" style={{ background: 'var(--danger)', color: 'white' }}>
            <Pause size={18} /> Stop Session
          </button>
        ) : (
          <button onClick={startSession} disabled={configuredBeacons.size === 0} className="btn-primary btn-full btn-lg">
            <Play size={18} /> Start Session
          </button>
        )}

        {(sessionStarted || attendanceList.length > 0) && (
          <div className="attendance-results">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={18} /> Live Attendance ({attendanceList.length})
              </h3>
              <button 
                onClick={exportToExcel} 
                className="btn-secondary btn-small" 
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Export to Excel"
                disabled={attendanceList.length === 0}
              >
                <Download size={14} /> Export
              </button>
            </div>
            <div className="attendance-list">
              {attendanceList.length === 0 ? (
                <div className="empty-state">
                  <Clock size={24} />
                  <p>Waiting for students...</p>
                </div>
              ) : (
                <ul>
                  {attendanceList.map((record: { id: string | number; enrollment_no: string; student_name: string; timestamp: string }) => (
                    <li key={record.id} className="attendance-item">
                      <div className="attendance-info">
                        <span className="enrollment">{record.enrollment_no}</span>
                        <span className="name">{record.student_name}</span>
                      </div>
                      <span className="time"><Clock size={12} />{new Date(record.timestamp).toLocaleTimeString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StudentDashboard({ user, onBiometricEnroll, onLogout }: { user: User; onBiometricEnroll: () => void; onLogout: () => void }) {
  const [beacons, setBeacons] = useState<BLEBeacon[]>([])
  const [biometricEnrolled, setBiometricEnrolled] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [attendanceMarked, setAttendanceMarked] = useState<{ name: string; time: string; matchScore: number } | null>(null)
  const [markedSessionIds, setMarkedSessionIds] = useState<Set<string>>(new Set())
  const [capturingFace, setCapturingFace] = useState(false)
  const [demoMode, setDemoMode] = useState(false)
  const videoRefCapture = useRef<HTMLVideoElement>(null)
  const canvasRefCapture = useRef<HTMLCanvasElement>(null)
  const toast = useToast()

  useEffect(() => {
    checkBiometricStatus()
  }, [])

  const checkBiometricStatus = async () => {
    try {
      const response = await fetch(apiUrl('/api/auth/biometric/status'), {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      })
      if (response.ok) {
        const data = await response.json()
        setBiometricEnrolled(data.enrolled)
      }
    } catch {
      // silently handle connection errors
    }
  }

  const scanForBeacons = async () => {
    setScanning(true)
    try {
      if (demoMode) {
        await new Promise(resolve => setTimeout(resolve, 1500))
        const activeDemoSession = localStorage.getItem('demo_active_session')
        if (!activeDemoSession) {
          toast.addToast('No active demo sessions found', 'warning', 3000)
          setScanning(false)
          return
        }

        const mockBeacon: BLEBeacon = {
          id: `beacon_demo_${Date.now()}`,
          name: 'LAS_Demo_Beacon_001',
          facultyName: 'Demo Faculty',
          subjectCode: 'CS101',
          sessionId: activeDemoSession,
          device: {} as any
        }
        setBeacons([mockBeacon])
        toast.addToast(`Found demo session for ${mockBeacon.subjectCode}`, 'success', 3000)
        setScanning(false)
        return
      }

      if (!navigator.bluetooth) {
        toast.addToast('Bluetooth not supported. Enable Demo mode to test.', 'warning', 2000)
        setScanning(false)
        return
      }

      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['12345678-1234-1234-1234-123456789abc']
      })

      if (device.gatt) {
        const server = await device.gatt.connect()
        const service = await server.getPrimaryService('12345678-1234-1234-1234-123456789abc')
        const characteristic = await service.getCharacteristic('abcd1234-5678-1234-5678-abcdef123456')

        if (characteristic) {
          const value = await characteristic.readValue()
          const sessionData = new TextDecoder().decode(value).replace(/\0/g, '').trim()

          if (sessionData && sessionData !== 'READY' && sessionData.includes('|')) {
            const [, facultyName, subjectCode, sessionId] = sessionData.split('|')

            const beaconInfo: BLEBeacon = {
              id: device.id || `beacon_${Date.now()}`,
              name: device.name || 'ESP32',
              facultyName: facultyName || 'Unknown',
              subjectCode: subjectCode || 'Unknown',
              sessionId: sessionId || 'Unknown',
              device
            }

            setBeacons(prev => [...prev.filter(b => b.id !== beaconInfo.id), beaconInfo])
            toast.addToast(`Found: ${subjectCode}`, 'info', 2000)
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && !error.message.includes('User cancelled')) {
        toast.addToast('Scan failed', 'error', 3000)
      }
    } finally {
      setScanning(false)
    }
  }

  const markAttendance = async (beacon: BLEBeacon) => {
    // Prevent multiple marks for same session
    if (markedSessionIds.has(beacon.sessionId)) {
      toast.addToast('Already marked for this session', 'warning', 2000)
      return
    }

    if (!biometricEnrolled) {
      toast.addToast('Enroll biometric first', 'info', 2000)
      onBiometricEnroll()
      return
    }

    setCapturingFace(true)
    let faceImage: string | null = null

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      })

      if (videoRefCapture.current) {
        videoRefCapture.current.srcObject = stream
        await new Promise<void>(resolve => {
          if (videoRefCapture.current) {
            videoRefCapture.current.onloadedmetadata = () => resolve()
          }
        })

        await new Promise(resolve => setTimeout(resolve, 500))

        if (canvasRefCapture.current && videoRefCapture.current) {
          const canvas = canvasRefCapture.current
          const context = canvas.getContext('2d')
          if (context) {
            canvas.width = videoRefCapture.current.videoWidth
            canvas.height = videoRefCapture.current.videoHeight
            context.drawImage(videoRefCapture.current, 0, 0, canvas.width, canvas.height)
            faceImage = canvas.toDataURL('image/jpeg', 0.9)
          }
        }

        stream.getTracks().forEach(track => track.stop())
      }

      if (!faceImage) {
        toast.addToast('Failed to capture face', 'error', 2000)
        setCapturingFace(false)
        return
      }
    } catch {
      toast.addToast('Camera access denied', 'error', 2000)
      setCapturingFace(false)
      return
    }

    setCapturingFace(false)

    if (!navigator.geolocation) {
      toast.addToast('Geolocation not supported', 'warning', 2000)
      return
    }

    navigator.geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords

      try {
        const response = await fetch(apiUrl('/api/attendance/mark'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({
            session_id: beacon.sessionId,
            faceData: faceImage,
            latitude,
            longitude
          })
        })

        if (demoMode || response.ok) {
          const matchScore = demoMode ? 0.95 : (await response.json()).attendance?.biometric_score || 0

          setMarkedSessionIds(prev => new Set([...prev, beacon.sessionId]))
          
          setAttendanceMarked({
            name: user.name,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            matchScore: Math.round(matchScore * 100)
          })

          toast.addToast(`Marked - Match: ${Math.round(matchScore * 100)}%`, 'success', 3000)
          setTimeout(() => setAttendanceMarked(null), 3000)
        } else {
          const error = await response.json()
          toast.addToast(error.error || 'Failed', 'error', 3000)
        }
      } catch (error) {
        if (demoMode) {
          setMarkedSessionIds(prev => new Set([...prev, beacon.sessionId]))
          setAttendanceMarked({
            name: user.name,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            matchScore: 95
          })
          toast.addToast(`Marked (Demo) - Match: 95%`, 'success', 3000)
          setTimeout(() => setAttendanceMarked(null), 3000)
        } else {
          toast.addToast('Network error', 'error', 2000)
        }
      }
    }, () => {
      toast.addToast('Enable location', 'warning', 2000)
    })
  }

  return (
    <div className="screen student-dashboard">
      <div className="dashboard-header">
        <div className="header-content">
          <h1>{user.name}</h1>
          <p className="header-subtitle">Mark attendance</p>
        </div>
        <button onClick={onLogout} className="btn-logout" title="Logout">
          <LogOut size={20} />
        </button>
      </div>

      {!biometricEnrolled && (
        <div className="alert alert-warning">
          <AlertCircle size={18} />
          <div className="alert-content">
            <strong>Biometric Not Enrolled</strong>
            <p>Enroll your biometric to mark attendance</p>
          </div>
          <button onClick={onBiometricEnroll} className="btn-small">
            Enroll
          </button>
        </div>
      )}

      {attendanceMarked && (
        <div className="alert alert-success">
          <CheckCircle size={20} />
          <div className="alert-content">
            <strong>Attendance Marked</strong>
            <p>{attendanceMarked.name} at {attendanceMarked.time}</p>
            <p className="match-score">Match: {attendanceMarked.matchScore}%</p>
          </div>
        </div>
      )}

      <div className="dashboard-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bluetooth size={18} /> Active Sessions
          </h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
            <input 
              type="checkbox" 
              checked={demoMode} 
              onChange={(e) => {
                setDemoMode(e.target.checked)
                setBeacons([])
                toast.addToast(e.target.checked ? 'Demo Mode enabled' : 'Demo Mode disabled', 'info', 2000)
              }} 
              style={{ cursor: 'pointer', width: '16px', height: '16px' }}
            />
            Demo
          </label>
        </div>
        
        {beacons.length === 0 && !scanning && (
          <div className="empty-state">
            <AlertCircle size={32} />
            <p>No sessions. Click scan button.</p>
          </div>
        )}

        {scanning && (
          <div className="loading-state">
            <Loader size={24} className="spin" />
            <p>Scanning...</p>
          </div>
        )}

        {beacons.map(beacon => (
          <div key={beacon.id} className="session-card">
            <div className="session-header">
              <div>
                <h3>{beacon.subjectCode}</h3>
                <p className="session-faculty">{beacon.facultyName}</p>
              </div>
              <span className={`status-badge ${markedSessionIds.has(beacon.sessionId) ? 'status-marked' : 'status-available'}`}>
                {markedSessionIds.has(beacon.sessionId) ? 'Marked' : 'Available'}
              </span>
            </div>
            <div className="session-details">
              <p><Bluetooth size={13} /> {beacon.name}</p>
              <p><MapPin size={13} /> {beacon.sessionId.substring(0, 10)}...</p>
            </div>
            <button 
              onClick={() => markAttendance(beacon)} 
              disabled={!biometricEnrolled || capturingFace || markedSessionIds.has(beacon.sessionId)}
              className="btn-primary btn-full"
            >
              {capturingFace ? (
                <>
                  <Camera size={16} className="spin" /> Capturing...
                </>
              ) : markedSessionIds.has(beacon.sessionId) ? (
                <>
                  <CheckCircle size={16} /> Marked
                </>
              ) : (
                <>
                  <Camera size={16} /> Mark
                </>
              )}
            </button>
          </div>
        ))}

        <button onClick={scanForBeacons} disabled={scanning} className="btn-secondary btn-full">
          {scanning ? (
            <>
              <Loader size={16} className="spin" /> Scanning...
            </>
          ) : (
            <>
              <Bluetooth size={16} /> Scan Sessions
            </>
          )}
        </button>
      </div>

      <canvas ref={canvasRefCapture} style={{ display: 'none' }} />
      <video ref={videoRefCapture} style={{ display: 'none' }} autoPlay playsInline muted />
    </div>
  )
}

function BiometricEnrollScreen({ onComplete }: { onComplete: () => void }) {
  const [faceImage, setFaceImage] = useState<string | null>(null)
  const startingCamera = useRef(false)
  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const toast = useToast()

  const stopCamera = useCallback(() => {
    startingCamera.current = false
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const startCamera = useCallback(async () => {
    if (streamRef.current || startingCamera.current) return

    startingCamera.current = true
    try {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        tempStream.getTracks().forEach(t => t.stop())
      } catch {
        // Cleanup
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      })

      if (!startingCamera.current) {
        stream.getTracks().forEach(track => track.stop())
        return
      }

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await new Promise((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = resolve
          }
        })
      }
    } catch (error) {
      let msg = 'Camera access failed. '
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') msg += 'Allow permissions.'
        else if (error.name === 'NotFoundError') msg += 'No camera found.'
        else if (error.name === 'NotReadableError') msg += 'Camera in use.'
        else msg += error.message
      }
      toast.addToast(msg, 'error', 3000)
    } finally {
      startingCamera.current = false
    }
  }, [toast])

  const captureFace = () => {
    if (!videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')

    if (!context) return

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    setFaceImage(canvas.toDataURL('image/jpeg', 0.8))
    toast.addToast('Face captured', 'success', 2000)
  }

  const completeEnrollment = async () => {
    if (!faceImage) {
      toast.addToast('Capture face first', 'warning', 2000)
      return
    }

    try {
      const response = await fetch(apiUrl('/api/auth/biometric/enroll'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          faceData: faceImage
        })
      })

      if (response.status === 403) {
        toast.addToast('Already enrolled', 'info', 2000)
        onComplete()
        return
      }

      if (response.ok) {
        toast.addToast('Enrolled successfully!', 'success', 2000)
        onComplete()
      } else {
        const error = await response.json()
        toast.addToast(error.error || 'Failed', 'error', 3000)
      }
    } catch {
      toast.addToast('Network error', 'error', 2000)
    }
  }

  useEffect(() => {
    startCamera()
    return () => { stopCamera() }
  }, [startCamera, stopCamera])

  return (
    <div className="screen biometric-enroll">
      <h1><Camera size={24} /> Face Registration</h1>

      <div className="enroll-step">
        <p className="instruction">Position your face in the camera</p>
        <div className="camera-container">
          <video ref={videoRef} autoPlay playsInline muted className="camera-preview" />
          <div className="camera-frame" />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>

        {faceImage && (
          <div className="captured-face">
            <div className="success-badge"><CheckCircle size={18} /> Registered</div>
            <img src={faceImage} alt="Captured" className="captured-image" />
          </div>
        )}

        <div className="enroll-actions">
          <button onClick={captureFace} disabled={!!faceImage} className="btn-primary">
            {faceImage ? (
              <>
                <CheckCircle size={16} /> Captured
              </>
            ) : (
              <>
                <Camera size={16} /> Capture
              </>
            )}
          </button>

          {faceImage && (
            <button onClick={completeEnrollment} className="btn-success">
              <CheckCircle size={16} /> Complete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  )
}

export default App

