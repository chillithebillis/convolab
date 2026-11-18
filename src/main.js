// CONVOLAB · Electron main process
const { app, BrowserWindow, ipcMain, dialog, shell, screen, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const crypto = require('crypto');
const https = require('https');
const REPO = 'chillithebillis/convolab';
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const ASSET_RE = IS_WIN ? /win-x64-setup\.exe$/i : /mac-arm64\.zip$/i;
const FF_NAME = IS_WIN ? 'ffmpeg.exe' : 'ffmpeg';

let win = null;
let outputDisplayId = null;

function ffmpegPath(){
  if(process.env.CONVOLAB_FFMPEG) return process.env.CONVOLAB_FFMPEG;
  const packed = path.join(process.resourcesPath || '', FF_NAME);
  if(fs.existsSync(packed)) return packed;
  for(const dev of [path.join(__dirname,'..','vendor',FF_NAME), path.join(__dirname,'..','dl',FF_NAME)]) if(fs.existsSync(dev)) return dev;
  try{ const st = require('ffmpeg-static'); if(st && fs.existsSync(st)) return st; }catch(e){}
  return 'ffmpeg';
}
const DOCS = path.join(app.getPath('documents'), 'CONVOLAB');
const PRESETS_DIR = path.join(DOCS, 'Presets');
const CACHE = path.join(app.getPath('temp'), 'convolab-cache');
for(const d of [DOCS, PRESETS_DIR, CACHE]) try{ fs.mkdirSync(d, {recursive:true}); }catch(e){}

function createWindow(){
  win = new BrowserWindow({
    width: 1680, height: 1050, minWidth: 1100, minHeight: 700,
    backgroundColor: '#0b0b0c', show: false,
    ...(IS_MAC ? { titleBarStyle: 'hiddenInset' } : { autoHideMenuBar: true }),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false,
      backgroundThrottling: false, webSecurity: true }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', ()=>win.show());
  win.webContents.setWindowOpenHandler(({frameName})=>{
    if(frameName === 'convolab_output'){
      const displays = screen.getAllDisplays();
      const d = displays.find(x=>x.id===outputDisplayId) || displays[displays.length-1];
      return { action:'allow', overrideBrowserWindowOptions:{ x:d.bounds.x, y:d.bounds.y, width:d.bounds.width, height:d.bounds.height,
        fullscreen: displays.length>1, frame:false, backgroundColor:'#000', title:'CONVOLAB Output', autoHideMenuBar:true } };
    }
    return { action:'deny' };
  });
}

function buildMenu(){
  const send = cmd => ()=> win && win.webContents.send('menu', cmd);
  const tpl = [
    { label: 'CONVOLAB', submenu: IS_MAC
      ? [ {role:'about'}, { label:'Check for Updates…', click: ()=>checkForUpdates(true) }, {type:'separator'}, {role:'hide'}, {role:'hideOthers'}, {type:'separator'}, {role:'quit'} ]
      : [ {role:'about'}, { label:'Check for Updates…', click: ()=>checkForUpdates(true) }, {type:'separator'}, {role:'quit'} ] },
    { label: 'File', submenu: [
      { label:'Open Source…', accelerator:'CmdOrCtrl+O', click: send('open') },
      { label:'Open Mask…', accelerator:'CmdOrCtrl+Shift+O', click: send('mask') },
      { label:'Open Audio…', accelerator:'CmdOrCtrl+Alt+O', click: send('audio') },
      {type:'separator'},
      { label:'Save PNG', accelerator:'CmdOrCtrl+S', click: send('png') },
      { label:'Save Preset JSON', accelerator:'CmdOrCtrl+Shift+S', click: send('json') },
      { label:'Render Video…', accelerator:'CmdOrCtrl+R', click: send('render') },
      {type:'separator'},
      { label:'Show Presets Folder', click: ()=>shell.openPath(PRESETS_DIR) },
    ]},
    { label: 'Edit', submenu: [ {role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'} ] },
    { label: 'View', submenu: [
      { label:'Toggle Panel', accelerator:'Tab', click: send('panel'), registerAccelerator:false },
      { label:'Reset Simulation', click: send('reset') },
      {type:'separator'}, {role:'togglefullscreen'}, {role:'resetZoom'}, {role:'zoomIn'}, {role:'zoomOut'},
      {type:'separator'}, {role:'toggleDevTools'} ] },
    { role: 'window', submenu: IS_MAC ? [ {role:'minimize'}, {role:'zoom'}, {role:'front'} ] : [ {role:'minimize'}, {role:'close'} ] },
    { role: 'help', submenu: [ { label:'Guia rápido', click: send('help') } ] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

// ------------------------------------------------------------ IPC: files & dialogs
ipcMain.handle('saveDialog', async (_e, {defaultName, kind})=>{
  const movies = path.join(app.getPath('videos'), 'CONVOLAB'); try{ fs.mkdirSync(movies, {recursive:true}); }catch(e){}
  const pics = path.join(app.getPath('pictures'), 'CONVOLAB'); try{ fs.mkdirSync(pics, {recursive:true}); }catch(e){}
  const filters = {
    png:[{name:'PNG', extensions:['png']}], json:[{name:'JSON', extensions:['json']}],
    prores_hq:[{name:'QuickTime ProRes', extensions:['mov']}], prores_4444:[{name:'QuickTime ProRes', extensions:['mov']}],
    h264:[{name:'MP4', extensions:['mp4']}], png_seq:[{name:'PNG sequence (base name)', extensions:['png']}]
  }[kind] || [];
  const dir = (kind==='png'||kind==='json') ? pics : movies;
  const r = await dialog.showSaveDialog(win, { defaultPath: path.join(dir, defaultName), filters });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('writeFile', async (_e, p, data)=>{ await fs.promises.mkdir(path.dirname(p), {recursive:true}); await fs.promises.writeFile(p, Buffer.from(data)); return true; });
ipcMain.handle('readFile', async (_e, p)=> new Uint8Array(await fs.promises.readFile(p)));
ipcMain.handle('reveal', (_e, p)=>{ shell.showItemInFolder(p); return true; });
ipcMain.handle('displays', ()=> screen.getAllDisplays().map((d,i)=>({ id:d.id, label:`${i+1}: ${d.label||'Display'} ${d.size.width}×${d.size.height}${d.id===screen.getPrimaryDisplay().id?' (main)':''}` })));
ipcMain.handle('setOutputDisplay', (_e, id)=>{ outputDisplayId = id; return true; });

// ------------------------------------------------------------ IPC: presets
const safe = n => n.replace(/[\/\\:*?"<>|]+/g,'_').slice(0,80);
ipcMain.handle('presetsList', async ()=>{
  const out = [];
  for(const f of (await fs.promises.readdir(PRESETS_DIR)).filter(f=>f.endsWith('.json'))){
    const base = f.slice(0,-5); const data = await fs.promises.readFile(path.join(PRESETS_DIR,f),'utf8');
    let thumb = ''; try{ thumb = 'data:image/png;base64,' + (await fs.promises.readFile(path.join(PRESETS_DIR, base+'.png'))).toString('base64'); }catch(e){}
    const st = await fs.promises.stat(path.join(PRESETS_DIR,f));
    out.push({name:base, data, thumb, t:st.mtimeMs});
  }
  return out.sort((a,b)=>b.t-a.t);
});
ipcMain.handle('presetSave', async (_e, name, json, thumb)=>{
  const base = path.join(PRESETS_DIR, safe(name));
  await fs.promises.writeFile(base+'.json', json); if(thumb) await fs.promises.writeFile(base+'.png', Buffer.from(thumb)); return true;
});
ipcMain.handle('presetDelete', async (_e, name)=>{
  const base = path.join(PRESETS_DIR, safe(name));
  for(const ext of ['.json','.png']) try{ await fs.promises.unlink(base+ext); }catch(e){}
  return true;
});

// ------------------------------------------------------------ IPC: ffmpeg helpers
function runFF(args){
  return new Promise((res, rej)=>{
    const p = spawn(ffmpegPath(), args); let log='';
    p.stderr.on('data', d=>{ log += d.toString(); if(log.length>20000) log = log.slice(-20000); });
    p.on('error', rej);
    p.on('close', code=> code===0 ? res(log) : rej(new Error(log.slice(-800))));
  });
}
const keyFor = p => { const st = fs.statSync(p); return crypto.createHash('md5').update(p+st.size+st.mtimeMs).digest('hex').slice(0,12); };
ipcMain.handle('makeProxy', async (_e, src)=>{
  const out = path.join(CACHE, 'proxy_'+keyFor(src)+'.mp4');
  if(fs.existsSync(out)) return out;
  await runFF(['-y','-i',src,'-map','0:v:0','-map','0:a:0?','-c:v','libx264','-preset','veryfast','-crf','12','-pix_fmt','yuv420p','-c:a','aac','-b:a','256k','-movflags','+faststart', out]);
  return out;
});
ipcMain.handle('convertImage', async (_e, src)=>{
  const out = path.join(CACHE, 'img_'+keyFor(src)+'.png');
  if(!fs.existsSync(out)) await runFF(['-y','-i',src,'-frames:v','1', out]);
  return out;
});
ipcMain.handle('extractAudio', async (_e, src)=>{
  const out = path.join(CACHE, 'aud_'+keyFor(src)+'.wav');
  if(fs.existsSync(out)) return out;
  try{ await runFF(['-y','-i',src,'-vn','-ac','2','-ar','48000','-c:a','pcm_s16le', out]); return out; }catch(e){ return null; }
});

// ------------------------------------------------------------ IPC: encoder
const jobs = new Map(); let jobSeq = 0;
ipcMain.handle('encStart', async (_e, o)=>{
  const id = ++jobSeq;
  const args = ['-y','-hide_banner','-f','rawvideo','-pix_fmt','rgba','-s',`${o.w}x${o.h}`,'-r',String(o.fps),'-i','pipe:0'];
  let hasAudio = false;
  if(o.audio && o.audio.path && o.format!=='png_seq'){
    const start = Math.max(0, (o.audio.start||0) + (o.audio.offset||0));
    args.push('-ss', String(start), '-t', String(o.duration+0.5), '-i', o.audio.path); hasAudio = true;
  }
  const vf = 'vflip,scale=out_color_matrix=bt709:out_range=tv';
  let out = o.path;
  if(o.format==='prores_hq'){
    args.push('-map','0:v:0'); if(hasAudio) args.push('-map','1:a:0?');
    args.push('-vf',vf,'-c:v','prores_ks','-profile:v','3','-vendor','apl0','-pix_fmt','yuv422p10le','-bits_per_mb','8000');
    if(hasAudio) args.push('-c:a','pcm_s24le');
  } else if(o.format==='prores_4444'){
    args.push('-map','0:v:0'); if(hasAudio) args.push('-map','1:a:0?');
    args.push('-vf',vf,'-c:v','prores_ks','-profile:v','4','-vendor','apl0','-pix_fmt','yuv444p10le','-alpha_bits','0');
    if(hasAudio) args.push('-c:a','pcm_s24le');
  } else if(o.format==='h264'){
    args.push('-map','0:v:0'); if(hasAudio) args.push('-map','1:a:0?');
    args.push('-vf',vf,'-c:v','libx264','-preset','slow','-crf','8','-pix_fmt','yuv420p','-profile:v','high','-movflags','+faststart');
    if(hasAudio) args.push('-c:a','aac','-b:a','320k');
  } else if(o.format==='png_seq'){
    const base = o.path.replace(/\.png$/i,'');
    fs.mkdirSync(base, {recursive:true});
    out = path.join(base, path.basename(base)+'_%05d.png');
    args.push('-vf','vflip','-c:v','png','-pix_fmt','rgb24');
  }
  if(o.format!=='png_seq'){
    args.push('-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709');
    if(hasAudio) args.push('-shortest');
    args.push('-metadata', 'comment='+String(o.meta||'').slice(0,60000), '-metadata','encoder=CONVOLAB');
  }
  args.push(out);
  const p = spawn(ffmpegPath(), args);
  const job = { p, log:'', closed:null };
  job.closed = new Promise(res=> p.on('close', code=>res(code)));
  p.stderr.on('data', d=>{ job.log += d.toString(); if(job.log.length>30000) job.log = job.log.slice(-30000); });
  p.on('error', e=>{ job.log += '\n'+e.message; });
  p.stdin.on('error', ()=>{});
  jobs.set(id, job);
  return id;
});
ipcMain.handle('encFrame', async (_e, id, data)=>{
  const job = jobs.get(id); if(!job) throw new Error('no job');
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if(!job.p.stdin.write(buf)) await new Promise(r=>job.p.stdin.once('drain', r));
  return true;
});
ipcMain.handle('encFinish', async (_e, id)=>{
  const job = jobs.get(id); if(!job) return {ok:false, log:'no job'};
  job.p.stdin.end(); const code = await job.closed; jobs.delete(id);
  return { ok: code===0, code, log: job.log };
});
ipcMain.handle('encCancel', async (_e, id)=>{
  const job = jobs.get(id); if(!job) return true; try{ job.p.stdin.destroy(); job.p.kill('SIGKILL'); }catch(e){} jobs.delete(id); return true;
});

// ------------------------------------------------------------ auto-update (GitHub Releases)
let pendingUpdate = null, updating = false;
const sendUpd = o => { if(win && !win.isDestroyed()) win.webContents.send('update', o); };
function getJSON(url){
  return new Promise((res, rej)=>{
    https.get(url, {headers:{'User-Agent':'CONVOLAB-updater','Accept':'application/vnd.github+json'}}, r=>{
      if(r.statusCode>=300 && r.statusCode<400 && r.headers.location) return getJSON(r.headers.location).then(res, rej);
      let b=''; r.on('data', d=>b+=d); r.on('end', ()=>{ if(r.statusCode!==200) return rej(new Error('HTTP '+r.statusCode)); try{ res(JSON.parse(b)); }catch(e){ rej(e); } });
    }).on('error', rej);
  });
}
function newer(a, b){ const pa=a.replace(/^v/,'').split('.').map(Number), pb=b.replace(/^v/,'').split('.').map(Number); for(let i=0;i<3;i++){ if((pa[i]||0)>(pb[i]||0)) return true; if((pa[i]||0)<(pb[i]||0)) return false; } return false; }
async function checkForUpdates(manual){
  try{
    const rel = await getJSON(`https://api.github.com/repos/${REPO}/releases/latest`);
    const asset = (rel.assets||[]).find(a=>ASSET_RE.test(a.name));
    if(asset && newer(rel.tag_name, app.getVersion())){
      pendingUpdate = { version: rel.tag_name.replace(/^v/,''), url: asset.browser_download_url, notes: rel.body||'' };
      sendUpd({state:'available', version: pendingUpdate.version, notes: pendingUpdate.notes});
      if(manual) dialog.showMessageBox(win, {message:`CONVOLAB ${pendingUpdate.version} disponível`, detail:'Use o botão "Atualizar" no topo da janela.'});
    } else { sendUpd({state:'none', manual}); if(manual) dialog.showMessageBox(win, {message:'Você está na versão mais recente', detail:'CONVOLAB '+app.getVersion()}); }
  }catch(e){ if(manual) dialog.showMessageBox(win, {type:'warning', message:'Não foi possível verificar atualizações', detail:String(e.message||e)}); }
}
function download(url, dest, onProgress){
  return new Promise((res, rej)=>{
    https.get(url, {headers:{'User-Agent':'CONVOLAB-updater','Accept':'application/octet-stream'}}, r=>{
      if(r.statusCode>=300 && r.statusCode<400 && r.headers.location) return download(r.headers.location, dest, onProgress).then(res, rej);
      if(r.statusCode!==200) return rej(new Error('HTTP '+r.statusCode));
      const total = +r.headers['content-length']||0; let got=0; const f = fs.createWriteStream(dest);
      r.on('data', d=>{ got+=d.length; if(total) onProgress(got/total); }); r.pipe(f); f.on('finish', ()=>f.close(()=>res(dest))); f.on('error', rej);
    }).on('error', rej);
  });
}
async function installUpdate(){
  if(!pendingUpdate || updating) return; updating = true;
  try{
    if(!app.isPackaged) throw new Error('Atualização automática só funciona no app empacotado.');
    if(IS_WIN) return await installUpdateWin();
    const bundle = path.resolve(app.getPath('exe'), '..', '..', '..');
    if(!bundle.endsWith('.app')) throw new Error('Bundle não encontrado: '+bundle);
    fs.accessSync(path.dirname(bundle), fs.constants.W_OK);
    const work = fs.mkdtempSync(path.join(app.getPath('temp'), 'convolab-upd-'));
    const zip = path.join(work, 'update.zip');
    await download(pendingUpdate.url, zip, p=>sendUpd({state:'progress', p}));
    await new Promise((res, rej)=>{ const p = spawn('/usr/bin/ditto', ['-x','-k', zip, path.join(work,'x')]); p.on('close', c=> c===0?res():rej(new Error('ditto '+c))); });
    const newApp = fs.readdirSync(path.join(work,'x')).map(n=>path.join(work,'x',n)).find(p=>p.endsWith('.app'));
    if(!newApp) throw new Error('Pacote de atualização sem .app');
    const script = path.join(work, 'swap.sh');
    fs.writeFileSync(script, `#!/bin/bash
while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done
B=${JSON.stringify(bundle)}; N=${JSON.stringify(newApp)}
rm -rf "$B.old"
if mv "$B" "$B.old" && mv "$N" "$B"; then rm -rf "$B.old"; else rm -rf "$B"; mv "$B.old" "$B"; fi
xattr -dr com.apple.quarantine "$B" 2>/dev/null
open "$B"
rm -rf ${JSON.stringify(work)}
`, {mode:0o755});
    spawn('/bin/bash', [script], {detached:true, stdio:'ignore'}).unref();
    app.quit();
  }catch(e){ updating=false; sendUpd({state:'error', message:String(e.message||e)}); }
}
async function installUpdateWin(){
  const work = fs.mkdtempSync(path.join(app.getPath('temp'), 'convolab-upd-'));
  const exe = path.join(work, 'CONVOLAB-setup.exe');
  await download(pendingUpdate.url, exe, p=>sendUpd({state:'progress', p}));
  // wait for this process to exit, then run the installer silently and relaunch the app
  const cmd = `ping -n 3 127.0.0.1 >nul & "${exe}" /S --force-run`;
  spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', cmd], {detached:true, stdio:'ignore', windowsHide:true, windowsVerbatimArguments:true}).unref();
  app.quit();
}
ipcMain.handle('version', ()=>app.getVersion());
ipcMain.handle('checkUpdates', ()=>checkForUpdates(true));
ipcMain.handle('installUpdate', ()=>installUpdate());

// ------------------------------------------------------------ app lifecycle
if(IS_WIN) app.setAppUserModelId('studio.suttam.convolab');
app.whenReady().then(()=>{
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb)=>cb(true));
  session.defaultSession.setPermissionCheckHandler(()=>true);
  app.setAboutPanelOptions({ applicationName:'CONVOLAB', applicationVersion: app.getVersion(), credits:'by chillibillis', copyright:'© chillibillis' });
  buildMenu(); createWindow();
  if(app.isPackaged){ setTimeout(()=>checkForUpdates(false), 6000); setInterval(()=>checkForUpdates(false), 6*3600*1000); }
  app.on('activate', ()=>{ if(BrowserWindow.getAllWindows().length===0) createWindow(); });
});
app.on('window-all-closed', ()=>app.quit());
