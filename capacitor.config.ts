import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.las.attendance',
  appName: 'LAS Attendance',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
}

export default config
