# Beacon Configuration Testing Guide

## Issue Fixed
The "beacon not found and not able to configure" issue has been resolved by adding a **Demo Mode** for testing without physical Bluetooth ESP32 devices.

## Two Operating Modes

### 1. **Demo Mode** (For Testing/Development)
Use this mode when you don't have physical Bluetooth devices.

**Steps:**
1. Login as Faculty
2. In "ESP32 Beacon Setup" section, toggle the **"Demo"** checkbox ON
3. Click **"Scan for Beacons"** button
   - It will create a mock beacon after ~1.5 seconds
   - Toast shows: "Demo beacon added: LAS_Demo_Beacon_001"
4. The beacon appears as a card with "Setup" badge
5. Click the beacon card OR **"Configure"** button
   - Beacon is paired instantly after ~0.8 seconds
   - Status changes to "Paired" (green badge)
   - Toast shows: "Beacon paired: LAS_Demo_Beacon_001"
6. Fill in required fields:
   - Subject (required)
   - Lecture No (required)
   - Department (required)
   - Semester (required)
   - Division (required)
7. Click **"Start Session"** button
   - Session starts immediately
   - Attendance list appears
   - Session can be ended with **"Stop Session"** button

### 2. **Real Bluetooth Mode** (Production)
Use this mode with actual ESP32 Bluetooth beacon devices.

**Requirements:**
- ESP32 board with Bluetooth LE capability
- Web Bluetooth API enabled in browser
- ESP32 running beacon firmware with service UUID: `12345678-1234-1234-1234-123456789abc`

**Steps:**
1. Login as Faculty
2. Ensure **"Demo"** toggle is OFF
3. Click **"Scan for Beacons"**
4. Browser will request Bluetooth device selection
5. Select your ESP32 device from the list
6. Rest is same as Demo Mode

## Feature Details

### Demo Mode Toggle
- Located in "ESP32 Beacon Setup" section header (top right)
- Checkbox labeled "Demo"
- When toggled:
  - Clears existing beacons and configured list
  - Shows info toast: "Demo Mode enabled/disabled"
  - Beacon scanning works with mock data
  - Beacon configuration is instant

### Beacon Card Display
Shows:
- **Beacon Name**: e.g., "LAS_Demo_Beacon_001"
- **Status Badge**: 
  - "Setup" (blue) - Ready to configure
  - "Paired" (green) - Successfully configured
- **Faculty Name**: Mock faculty or device owner
- **Subject Code**: Mock code or actual beacon data

### Session Configuration
Required fields to fill before starting:
- **Subject**: Dropdown selection
- **Lecture No**: Text input (number)
- **Department**: Text input
- **Semester**: Text input (e.g., "3")
- **Division**: Text input (e.g., "A")
- **Date**: Auto-filled with today's date

### Session Management
- **Start Session**: Begins attendance marking for students
- **Stop Session**: Ends session (button appears when session active)
- **Live Attendance**: Lists all marked attendances with timestamps

## Testing Workflow

### Complete Test Flow (Demo Mode):
```
1. Open http://localhost:5173
2. Role: Faculty
3. Email: faculty@test.com
4. Password: (enter)
5. Toggle "Demo" ON
6. Scan for Beacons → Demo beacon appears
7. Configure Beacon → Status: Paired
8. Select Subject
9. Fill Lecture No, Department, Semester, Division
10. Start Session
11. (Open student account in another window)
12. Mark attendance as student
13. See attendance appear in faculty list
14. Stop Session
```

### Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| "Bluetooth not supported" | Enable Demo Mode |
| Beacon scan shows error | Toggle Demo OFF → Toggle ON |
| Can't configure beacon | Select Subject first |
| Can't start session | Fill all required fields + configure beacon |
| No beacons after scan | Ensure Demo is toggled ON/OFF correctly |

## Code Changes Made

1. **Added `demoMode` state** to Faculty Dashboard
2. **Updated `scanForBeacons()`**:
   - Creates mock beacon when demoMode is true
   - Falls back to warning if Bluetooth unavailable (suggests Demo Mode)
3. **Updated `configureBeacon()`**:
   - Instant configuration in demo mode
   - Real Bluetooth configuration in production mode
4. **Added Demo Toggle UI**:
   - Checkbox in beacon section header
   - Clears beacons when toggled
   - Shows info toast on toggle

## API Integration

Demo mode uses the same API endpoints as real mode:
- `POST /api/bluetooth/session/start` - Start attendance session
- `GET /api/attendance/{sessionId}` - Fetch attendance records
- `POST /api/biometric/mark-attendance` - Record attendance (from student side)

All endpoints point to `http://localhost:3002` (backend server).

## Mobile Testing

Demo mode works on mobile browsers:
- Responsive layout adjusts for smaller screens
- Touch-friendly buttons and checkboxes
- Demo beacon toggle visible on mobile

## Next Steps

1. **Test with Demo Mode**: Verify all features work
2. **Deploy to Real Device**: When ESP32 hardware available, toggle Demo OFF
3. **QR Code for Students**: Students can scan session QR code from faculty dashboard
4. **Verify Attendance**: Check attendance records are saved correctly
