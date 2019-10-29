const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const controller = require('./controller');
const templating = require('./templating');

const Cookies = require('cookies');

const url = require('url')
const ws = require('ws')

const app = new Koa();
const WebSocketServer = ws.Server

const isProduction = process.env.NODE_ENV === 'production';

//记录URL以及页面执行时间
app.use(async (ctx, next) => {
  console.log(`Process ${ctx.request.method} ${ctx.request.url}...`);
  var 
      start = new Date().getTime(),
      execTime;
  await next();
  execTime = new Date().getTime() - start;
  ctx.response.set('X-Response-Time', `${execTime}ms`);
})

//parse user from cookie
app.use(async (ctx, next) => {
  ctx.state.user = parseUser(ctx.cookies.get('name') || '')
  await next()
})

//生产环境下由nginx处理静态文件
//开发环境node额外处理静态文件
if (! isProduction) {
  let staticFiles = require('./static-files');
  app.use(staticFiles('/static/', __dirname + '/static'));
}

//解析post请求
app.use(bodyParser());

//模板解析
app.use(templating('views', {
  noCache: !isProduction,
  watch: !isProduction
}));

app.use(controller());

let server = app.listen(3000);

const parseUser = function(obj) {
  if (!obj) {
    return
  }
  console.log('try parse:', obj)
  let s = ''
  if (typeof(obj) === 'string') {
    s = obj
  } else if (obj.headers) {
    let cookie = new Cookies(obj, null) 
    s = cookie.get('name')
  }
  if (s) {
    try {
      let user = JSON.parse(Buffer.from(s, 'base64').toString())
      console.log(`User: ${user.name},ID: ${user.id}`)
      return user
    } catch (e) {
      console.warn(e)
    }
  }
}


function createWebSocketServer(server, onConnection, onMessage, onClose, onError) {
  let wss = new WebSocketServer({
    server: server
  })

  wss.broadcast = function broadcast(data) {
    wss.clients.forEach(function each(client) {
      client.send(data)
    })
  }
  onConnection = onConnection || function () {
    console.log('[Websocket] connected.')
  }
  onMessage = onMessage || function (msg) {
      console.log('[WebSocket] message received: ' + msg);
  }
  onClose = onClose || function (code, message) {
      console.log(`[WebSocket] closed: ${code} - ${message}`);
  }
  onError = onError || function (err) {
      console.log('[WebSocket] error: ' + err);
  }
  wss.on('connection', function (ws) {
    let location = url.parse(ws.upgradeReq.url, true)
    console.log('[WebSocketServer] connection: ' + location.href)
    ws.on('message', onMessage)
    ws.on('close', onClose)
    ws.on('error', onError)
    if (location.pathname !== '/ws/chat') {
      //close ws
      ws.close(4000, 'Invalid URL')
    }
    //check user
    let user = parseUser(ws.upgradeReq)
    if (!user) {
      ws.close(4001, 'Invalid User')
    }
    ws.user = user
    ws.wss = wss
    onConnection.apply(ws)
  })
  console.log('WebSocketServer was attached.');
  return wss;
}

let messageIndex = 0 

function createMessage(type, user, data) {
  messageIndex ++
  return JSON.stringify({
    id: messageIndex,
    type: type,
    user: user,
    data: data
  })
}

function onConnect() {
  let user = this.user
  let msg = createMessage('join', user, `${user.name} joined`)
  this.wss.broadcast(msg)
  let users = this.wss.clients.map(function (client) {
    return client.user
  })
  this.send(createMessage('list', user, users))
}

function onMessage(message) {
  console.log(message)
  if (message && message.trim()){
    let msg = createMessage('chat', this.user, message.trim());
    this.wss.broadcast(msg);
  }
}

function onClose() {
  let user = this.user;
  let msg = createMessage('left', user, `${user.name} is left.`);
  this.wss.broadcast(msg);
}

app.wss = createWebSocketServer(server, onConnect, onMessage, onClose);


console.log('app listen on port 3000');