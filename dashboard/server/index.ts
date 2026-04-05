import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import router from './routes.js'

const app = express()
const port = parseInt(process.env.PORT ?? '8080', 10)

app.use(router)

if (process.env.NODE_ENV === 'production') {
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const clientDir = path.resolve(__dirname, '../client')

  app.use(express.static(clientDir))

  app.get('{*path}', (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'))
  })
}

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
})
