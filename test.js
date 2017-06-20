const test = require('blue-tape')
const http = require('follow-redirects').http
const express = require('express')
const { promisify } = require('util')
const concat = require('concat-stream')
const FormData = require('form-data')

const listen = (app) => new Promise((resolve, reject) => {
  const server = app.listen((err) => {
    if (err) return reject(err)
    resolve(server)
  })
})

let closeServer
let baseURL
let port
let request
let server

const startServer = async () => {
  const app = express()

  app.post('/upload', (req, res) => {
    // console.error(req.headers)
    req.pipe(concat(() => {
      res.json({ headers: req.headers })
    }))
  })

  server = await listen(app)

  closeServer = promisify(server.close.bind(server))
  port = server.address().port
  baseURL = `http://localhost:${port}`
  return server
}

test('start server', startServer)

test('upload file', (t) => {
  const buf = new Buffer('deadbeef', 'hex')
  const form = new FormData()
  form.append('some-image', buf, {
    filename: 'some-image.jpg',
    contentType: 'image/jpeg',
  })

  const headers = Object.assign({}, form.getHeaders())
  const boundaryId = headers['content-type'].substr(-24)
  t.deepEqual(headers, {
    /* eslint-disable max-len */
    'content-type': `multipart/form-data; boundary=--------------------------${boundaryId}`,
  })

  const req = http.request({
    method: 'POST',
    port,
    hostname: 'localhost',
    path: '/upload',
    headers: Object.assign({}, {
      'Accept': 'application/json, text/plain, */*',
    }, headers),
  }, (res) => {
    res.pipe(concat((data) => {
      t.deepEqual(JSON.parse(data.toString()), {
        headers: {
          accept: 'application/json, text/plain, */*',
          connection: 'close',
          'content-type': `multipart/form-data; boundary=--------------------------${boundaryId}`,
          host: `localhost:${port}`,
          'transfer-encoding': 'chunked',
        },
      }, 'got expected headers')
      t.end()
    }))
  })
  req.on('error', t.fail)
  form.pipe(req)
})

test('stop server', async () => {
  await closeServer()
})
