const http=require('http');
const srv=http.createServer((req,res)=>{
  const auth=req.headers.authorization||'';
  const u=req.url.split('?')[0];
  if(u==='/bearer') return res.writeHead(auth.startsWith('Bearer ')?200:401).end('{}');
  if(u.startsWith('/basic-auth/')||u.startsWith('/hidden-basic-auth/'))
    return res.writeHead(auth.startsWith('Basic ')?200:401).end('{}');
  const m=u.match(/^\/status\/(\d+)$/);
  if(m) return res.writeHead(parseInt(m[1],10)).end();
  res.writeHead(200,{'content-type':'application/json'}); res.end('{}');
});
srv.listen(8099,'127.0.0.1',()=>console.log('fake bingo on 8099'));
