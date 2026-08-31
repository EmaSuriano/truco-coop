import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const mqttMinPath = fileURLToPath(new URL('./node_modules/mqtt/dist/mqtt.min.js', import.meta.url))

function mqttIifeShim() {
  return {
    name: 'mqtt-iife-shim',
    enforce: 'pre' as const,
    resolveId(id: string) {
      const n = id.replace(/\\/g, '/')
      if (n === '\0mqtt-iife' || n.includes('mqtt.min.js')) return null
      if (
        n === 'mqtt' ||
        n.endsWith('/mqtt/dist/mqtt.esm.js') ||
        n.endsWith('/mqtt/build/index.js') ||
        n.endsWith('/mqtt/index.js')
      ) {
        return '\0mqtt-iife'
      }
    },
    load(id: string) {
      if (id !== '\0mqtt-iife') return null
      const source = fs.readFileSync(mqttMinPath, 'utf8')
      return `const mqtt = new Function(${JSON.stringify(source)} + "; return mqtt;")();\nexport default mqtt;\n`
    },
  }
}

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  server: { port: 3000, strictPort: true, host: true },
  plugins: [mqttIifeShim()],
})
