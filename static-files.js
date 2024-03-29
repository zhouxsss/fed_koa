const path = require('path')
const mime = require('mime')
const fs = require('mz/fs')

// url: 类似 '/static/'
// dir: 类似 __dirname + '/static'
function staticFiles(url, dir) {
  return async (ctx, next) => {
    let rpath = ctx.request.path
    if(rpath.startsWith(url)) {
      //获取完整路径
      let fp = path.join(dir, rpath.substring(url.length))
      console.log('static',fp)
      //判断文件是否存在
      if (await fs.exists(fp)) {
        //查找文件的mime
        ctx.response.type = mime.lookup(rpath)
        //读取文件内容赋值给页面
        ctx.response.body = await fs.readFile(fp)
      } else {
        //文件不存在
        ctx.response.status = 404
      }
    } else {
      // 不是指定前缀的URL，继续处理下一个middleware:
      await next()
    }
  }
}

module.exports = staticFiles
