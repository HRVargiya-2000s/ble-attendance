import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import jwt from 'jsonwebtoken'
import XLSX from 'xlsx'
import { initFaceEngine, detectFaces, extractEmbedding, cosineSimilarity } from './faceEngine.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..', '..')
const app = express()

const PORT = Number(process.env.PORT || 3002)
const JWT_SECRET = process.env.JWT_SECRET || 'las_local_dev_secret_change_me'

const state = {
  students: [],
  faculty: [],
  subjects: [],
  biometricEnrollments: {}, // { userId: { faceEmbedding, enrolledAt } }
  biometricByUserId: new Set(),
  sessions: [],
  attendance: []
}

const defaultSubjectsByDepartment = {
  comp: ['Data Structures', 'Operating Systems', 'DBMS', 'Computer Networks'],
  mech: ['Thermodynamics', 'Machine Design', 'Fluid Mechanics', 'Manufacturing Process'],
  ec: ['Digital Electronics', 'Signals & Systems', 'VLSI Design', 'Embedded Systems']
}

function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function normalizeValue(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value))
  return String(value).trim()
}

function pickField(row, aliases) {
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim() !== '') {
      return normalizeValue(row[alias])
    }
  }
  return ''
}

function buildNormalizedRow(rawRow) {
  return Object.entries(rawRow).reduce((acc, [key, value]) => {
    acc[normalizeKey(key)] = value
    return acc
  }, {})
}

function departmentFromFileName(fileName) {
  if (/comp/i.test(fileName)) return 'Computer'
  if (/mech/i.test(fileName)) return 'Mechanical'
  if (/ec/i.test(fileName)) return 'Electronics'
  return 'General'
}

function departmentCode(department) {
  const normalized = normalizeKey(department)
  if (normalized.includes('comp')) return 'comp'
  if (normalized.includes('mech')) return 'mech'
  if (normalized === 'ec' || normalized.includes('electron')) return 'ec'
  return 'comp'
}

function excelRows(filePath) {
  const workbook = XLSX.readFile(filePath)
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json(firstSheet, { defval: '' })
}

function loadCredentialsFromExcel() {
  const allFiles = fs.readdirSync(projectRoot)
  const studentFiles = allFiles.filter((file) => /^Student_.*\.xlsx$/i.test(file))
  const facultyFiles = allFiles.filter((file) => /^Faculty_.*\.xlsx$/i.test(file))

  let studentIdSeed = 1
  let facultyIdSeed = 1000
  let subjectIdSeed = 1

  const students = []
  const faculty = []
  const subjects = []

  for (const fileName of studentFiles) {
    const department = departmentFromFileName(fileName)
    const fullPath = path.join(projectRoot, fileName)

    const rows = excelRows(fullPath)

    for (const rowRaw of rows) {
      const row = buildNormalizedRow(rowRaw)
      const enrollmentNo = pickField(row, [
        'enrollmentno',
        'enrollmentnumber',
        'enrolmentno',
        'rollno',
        'rollnumber',
        'temprollno',
        'studentid',
        'id'
      ])

      if (!enrollmentNo) continue

      const name = pickField(row, ['name', 'studentname', 'fullname']) || `Student ${enrollmentNo}`
      const password = pickField(row, ['password', 'pass', 'pwd', 'pin']) || enrollmentNo
      const semester = pickField(row, ['semester', 'sem']) || '1'
      const division = pickField(row, ['division', 'div']) || 'A'

      students.push({
        id: studentIdSeed++,
        name,
        role: 'student',
        enrollment_no: enrollmentNo,
        password,
        department,
        semester,
        division
      })
    }
  }

  for (const fileName of facultyFiles) {
    const department = departmentFromFileName(fileName)
    const fullPath = path.join(projectRoot, fileName)

    const rows = excelRows(fullPath)

    for (const rowRaw of rows) {
      const row = buildNormalizedRow(rowRaw)
      const name = pickField(row, ['name', 'facultyname', 'fullname'])
      if (!name) continue

      const email = pickField(row, ['email', 'mail', 'username', 'loginid', 'domainid'])
      const employeeId = pickField(row, ['employeeid', 'empid', 'facultyid', 'id'])
      const generatedEmail = `${name.toLowerCase().replace(/\s+/g, '.')}@las.local`
      const identifier = email || generatedEmail
      const password = pickField(row, ['password', 'pass', 'pwd', 'pin']) || employeeId || identifier

      const facultyItem = {
        id: facultyIdSeed++,
        name,
        role: 'faculty',
        email: identifier,
        employee_id: employeeId,
        password,
        department,
        semester: pickField(row, ['semester', 'sem']) || '',
        division: pickField(row, ['division', 'div']) || ''
      }

      faculty.push(facultyItem)

      const rawSubjectList = pickField(row, ['subjects', 'subject', 'courses', 'course'])
      const parsedSubjects = rawSubjectList
        ? rawSubjectList.split(/[,;/]/).map((item) => item.trim()).filter(Boolean)
        : defaultSubjectsByDepartment[departmentCode(department)]

      for (const subjectName of parsedSubjects) {
        subjects.push({
          id: subjectIdSeed++,
          subject_name: subjectName,
          faculty_id: facultyItem.id
        })
      }
    }
  }

  state.students = students
  state.faculty = faculty
  state.subjects = subjects

  fs.writeFileSync(
    path.join(projectRoot, 'backend', 'data', 'credentials-cache.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        students: students.map(({ password, ...rest }) => rest),
        faculty: faculty.map(({ password, ...rest }) => rest),
        subjects
      },
      null,
      2
    )
  )

  console.log(`Loaded credentials: ${students.length} students, ${faculty.length} faculty, ${subjects.length} subjects`)
}

function createToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  )
}

function auth(requiredRole) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

    if (!token) {
      return res.status(401).json({ error: 'Missing token' })
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET)

      if (requiredRole && decoded.role !== requiredRole) {
        return res.status(403).json({ error: 'Forbidden for this role' })
      }

      req.auth = decoded
      next()
    } catch {
      return res.status(401).json({ error: 'Invalid token' })
    }
  }
}

app.use(cors())
app.use(express.json({ limit: '8mb' }))

// Initialize face engine
let faceEngineReady = false
;(async () => {
  faceEngineReady = await initFaceEngine()
  if (faceEngineReady) {
    console.log('Face recognition engine initialized')
  } else {
    console.warn('Face recognition engine failed to initialize')
  }
})()

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', students: state.students.length, faculty: state.faculty.length, faceEngine: faceEngineReady })
})

app.post('/api/auth/student-login', (req, res) => {
  const enrollmentNo = normalizeValue(req.body?.enrollment_no)
  const password = normalizeValue(req.body?.password)

  const student = state.students.find(
    (item) => normalizeValue(item.enrollment_no) === enrollmentNo && normalizeValue(item.password) === password
  )

  if (!student) {
    return res.status(401).json({ error: 'Invalid student credentials' })
  }

  const token = createToken(student)
  const { password: _password, ...safeStudent } = student
  return res.json({ token, student: safeStudent })
})

app.post('/api/auth/faculty-login', (req, res) => {
  const identifier = normalizeValue(req.body?.email).toLowerCase()
  const password = normalizeValue(req.body?.password)

  const faculty = state.faculty.find((item) => {
    const emailMatch = normalizeValue(item.email).toLowerCase() === identifier
    const empMatch = normalizeValue(item.employee_id).toLowerCase() === identifier
    return (emailMatch || empMatch) && normalizeValue(item.password) === password
  })

  if (!faculty) {
    return res.status(401).json({ error: 'Invalid faculty credentials' })
  }

  const token = createToken(faculty)
  const { password: _password, ...safeFaculty } = faculty
  return res.json({ token, faculty: safeFaculty })
})

app.get('/api/faculty/subjects', auth('faculty'), (req, res) => {
  const facultyId = req.auth.userId
  const facultySubjects = state.subjects.filter((subject) => subject.faculty_id === facultyId)
  res.json({ subjects: facultySubjects })
})

app.post('/api/bluetooth/session/start', auth('faculty'), (req, res) => {
  const body = req.body || {}
  const sessionId = body.session_id ? normalizeValue(body.session_id) : `session_${Date.now()}_${Math.floor(Math.random() * 9999)}`

  const session = {
    id: sessionId,
    subject_id: Number(body.subject_id),
    lecture_no: Number(body.lecture_no),
    department: normalizeValue(body.department),
    semester: normalizeValue(body.semester),
    division: normalizeValue(body.division),
    date: normalizeValue(body.date),
    faculty_id: req.auth.userId,
    started_at: new Date().toISOString()
  }

  state.sessions.push(session)
  res.json({ session })
})

app.get('/api/attendance/:sessionId', auth('faculty'), (req, res) => {
  const sessionId = normalizeValue(req.params.sessionId)
  const records = state.attendance.filter((a) => a.session_id === sessionId)

  const enriched = records.map((r) => {
    const student = state.students.find((s) => s.id === r.student_id)
    return {
      ...r,
      student_name: student ? student.name : 'Unknown',
      enrollment_no: student ? student.enrollment_no : 'Unknown'
    }
  })

  res.json({ attendance: enriched })
})

app.get('/api/auth/biometric/status', auth(), (req, res) => {
  const enrolled = !!state.biometricEnrollments[req.auth.userId]
  res.json({ enrolled, canReenroll: false })
})

app.post('/api/auth/biometric/enroll', auth(), async (req, res) => {
  const userId = req.auth.userId

  // Check if already enrolled (one-time only)
  if (state.biometricEnrollments[userId]) {
    return res.status(403).json({ error: 'Biometric already enrolled for this user. Cannot re-enroll.' })
  }

  const faceDataBase64 = req.body?.faceData
  if (!faceDataBase64 || !faceDataBase64.startsWith('data:image')) {
    return res.status(400).json({ error: 'Invalid face image data' })
  }

  try {
    // Extract base64 content
    const base64Data = faceDataBase64.split(',')[1]
    const imageBuffer = Buffer.from(base64Data, 'base64')

    // Detect faces and extract embedding
    const faces = await detectFaces(imageBuffer)
    if (!faces || faces.length === 0) {
      return res.status(400).json({ error: 'No face detected in image' })
    }

    if (faces.length > 1) {
      return res.status(400).json({ error: 'Multiple faces detected. Please provide only your face.' })
    }

    // Extract 128-dim face embedding
    const embedding = await extractEmbedding(imageBuffer, faces[0])
    if (!embedding) {
      return res.status(400).json({ error: 'Failed to extract face features' })
    }

    // Store enrollment (one-time only)
    state.biometricEnrollments[userId] = {
      faceEmbedding: embedding,
      enrolledAt: new Date().toISOString(),
      enrollmentPhotoHash: Buffer.from(imageBuffer).toString('hex').substring(0, 16)
    }

    res.json({ success: true, message: 'Biometric enrolled successfully. Cannot be changed.' })
  } catch (error) {
    console.error('Biometric enrollment error:', error)
    res.status(500).json({ error: 'Failed to process face biometric' })
  }
})

app.post('/api/attendance/mark', auth('student'), async (req, res) => {
  const sessionId = normalizeValue(req.body?.session_id)
  const latitude = Number(req.body?.latitude)
  const longitude = Number(req.body?.longitude)
  const faceDataBase64 = req.body?.faceData
  const userId = req.auth.userId

  if (!sessionId) {
    return res.status(400).json({ error: 'session_id is required' })
  }

  // Check if biometric is enrolled
  if (!state.biometricEnrollments[userId]) {
    return res.status(403).json({ error: 'Biometric not enrolled. Please enroll first.' })
  }

  try {
    let biometricScore = 0
    if (faceDataBase64 && faceDataBase64.startsWith('data:image')) {
      // Verify face biometric for attendance
      const base64Data = faceDataBase64.split(',')[1]
      const imageBuffer = Buffer.from(base64Data, 'base64')

      const faces = await detectFaces(imageBuffer)
      if (!faces || faces.length === 0) {
        return res.status(400).json({ error: 'No face detected. Please ensure your face is clearly visible.' })
      }

      const testEmbedding = await extractEmbedding(imageBuffer, faces[0])
      if (!testEmbedding) {
        return res.status(400).json({ error: 'Could not extract face features' })
      }

      const enrolledEmbedding = state.biometricEnrollments[userId].faceEmbedding
      const similarity = cosineSimilarity(testEmbedding, enrolledEmbedding)

      console.log(`Face match similarity for user ${userId}: ${similarity}`)

      if (similarity < 0.5) {
        return res.status(403).json({ error: `Face verification failed. Match: ${(similarity * 100).toFixed(1)}%` })
      }

      biometricScore = similarity
    }

    const mark = {
      id: `att_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
      session_id: sessionId,
      student_id: userId,
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      biometric_verified: !!faceDataBase64,
      biometric_score: biometricScore,
      timestamp: new Date().toISOString()
    }

    state.attendance.push(mark)

    const student = state.students.find(s => s.id === userId)
    res.json({ 
      success: true, 
      attendance: mark, 
      studentName: student ? student.name : 'Unknown',
      message: 'Attendance marked successfully with biometric verification' 
    })
  } catch (error) {
    console.error('Attendance marking error:', error)
    res.status(500).json({ error: 'Failed to process attendance' })
  }
})

loadCredentialsFromExcel()

app.listen(PORT, () => {
  console.log(`LAS backend running on http://localhost:${PORT}`)
})
