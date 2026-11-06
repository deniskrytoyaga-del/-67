const SYSTEM_PROMPT = `Ты — 67 SUPPORT AI, заместитель директора легендарного сайта 67. Твой характер: абсурдный, смешной, слегка дерзкий, мемный и максимально бесполезный, но доброжелательный. Отвечай по-русски, если пользователь пишет по-русски; подстраивайся под язык пользователя. Иногда вставляй «67», но не в каждое предложение. На вопросы о сайте помогай по делу, если можешь. Не оскорбляй пользователя, не проси личные данные, пароли или секреты. Не выдумывай, что можешь менять сайт, баланс или аккаунты. Короткие ответы предпочтительны.`;

const ALLOWED_ORIGINS = new Set(["https://deniskrytoyaga-del.github.io"]);
const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers });
const encoder = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const randomToken = (length = 32) => {
 const bytes = crypto.getRandomValues(new Uint8Array(length));
 return Array.from(bytes, b => b.toString(16).padStart(2,"0")).join("");
};
async function hashPassword(password, salt) {
 const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
 const bits = await crypto.subtle.deriveBits({name:"PBKDF2",salt:unb64(salt),iterations:210000,hash:"SHA-256"},key,256);
 return b64(bits);
}
async function passwordRecord(password) {
 const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
 return {salt, hash:await hashPassword(password,salt)};
}
async function getUser(request, env) {
 const token = (request.headers.get("Authorization") || "").replace(/^Bearer\\s+/i,"");
 if (!token) return null;
 return await env.DB.prepare("SELECT users.id, users.username, users.coins, users.clicks, users.owned_skins, users.active_skin FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?").bind(await sha256(token),Date.now()).first();
}
async function sha256(value) {
 const digest = await crypto.subtle.digest("SHA-256",encoder.encode(value));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
}
function validUsername(value) { return typeof value==="string" && /^[a-zA-Z0-9_]{3,20}$/.test(value); }
function validPassword(value) { return typeof value==="string" && value.length>=8 && value.length<=128; }
function profile(user) {
 return {username:user.username,coins:user.coins,clicks:user.clicks,ownedSkins:JSON.parse(user.owned_skins||'["classic"]'),activeSkin:user.active_skin||"classic"};
}

export default {
 async fetch(request, env) {
  const origin=request.headers.get("Origin")||"";
  const allowed=ALLOWED_ORIGINS.has(origin);
  const headers={
   "Access-Control-Allow-Origin":allowed?origin:"null",
   "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
   "Access-Control-Allow-Headers":"Content-Type, Authorization",
   "Access-Control-Max-Age":"86400",
   "Content-Type":"application/json; charset=utf-8",
   "Vary":"Origin"
  };
  if(request.method==="OPTIONS") return new Response(null,{headers});
  if(origin && !allowed) return json({error:"Origin not allowed"},403,headers);
  const url=new URL(request.url);
  const path=url.pathname;
  if(path==="/chat" && request.method==="POST") {
   if(!env.OPENROUTER_API_KEY) return json({error:"На сервере пока нет ключа AI."},503,headers);
   try {
    const body=await request.json();
    if(!Array.isArray(body.messages)||body.messages.length===0) return json({error:"Напиши сообщение."},400,headers);
    const messages=body.messages.slice(-12).map(m=>({role:m.role==="assistant"?"assistant":"user",content:String(m.content||"").slice(0,1200)}));
    const upstream=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Authorization":"Bearer "+env.OPENROUTER_API_KEY,"Content-Type":"application/json","HTTP-Referer":"https://deniskrytoyaga-del.github.io/-67/","X-Title":"67 Support AI"},body:JSON.stringify({model:"openrouter/free",messages:[{role:"system",content:SYSTEM_PROMPT},...messages],max_tokens:220,temperature:.95})});
    const data=await upstream.json();
    if(!upstream.ok) return json({error:data.error?.message||"Бесплатная модель занята. Попробуй позже."},502,headers);
    const reply=data.choices?.[0]?.message?.content;
    return json({reply:typeof reply==="string"?reply:"67 временно задумалось."},200,headers);
   } catch(e) { return json({error:"Ошибка 67-сервера. Попробуй позже."},500,headers); }
  }
  if(!env.DB) return json({error:"База аккаунтов ещё не подключена: добавь D1 binding с именем DB."},503,headers);
  try {
   if(path==="/register" && request.method==="POST") {
    const body=await request.json(), username=String(body.username||"").trim(), password=body.password;
    if(!validUsername(username)) return json({error:"Логин: 3–20 символов, только латинские буквы, цифры и _."},400,headers);
    if(!validPassword(password)) return json({error:"Пароль должен содержать от 8 до 128 символов."},400,headers);
    const exists=await env.DB.prepare("SELECT id FROM users WHERE username_key=?").bind(username.toLowerCase()).first();
    if(exists) return json({error:"Такой логин уже занят."},409,headers);
    const pass=await passwordRecord(password), userId=randomToken(16), token=randomToken();
    await env.DB.prepare("INSERT INTO users (id,username,username_key,password_salt,password_hash,coins,clicks,owned_skins,active_skin,created_at,updated_at) VALUES (?,?,?,?,?,0,0,?, 'classic', ?, ?)").bind(userId,username,username.toLowerCase(),pass.salt,pass.hash,'["classic"]',Date.now(),Date.now()).run();
    await env.DB.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").bind(await sha256(token),userId,Date.now()+30*24*60*60*1000).run();
    const user=await env.DB.prepare("SELECT username,coins,clicks,owned_skins,active_skin FROM users WHERE id=?").bind(userId).first();
    return json({token,profile:profile(user)},201,headers);
   }
   if(path==="/login" && request.method==="POST") {
    const body=await request.json(), username=String(body.username||"").trim().toLowerCase(), password=body.password;
    if(!username||typeof password!=="string") return json({error:"Введи логин и пароль."},400,headers);
    const user=await env.DB.prepare("SELECT * FROM users WHERE username_key=?").bind(username).first();
    if(!user || await hashPassword(password,user.password_salt)!==user.password_hash) return json({error:"Неверный логин или пароль."},401,headers);
    const token=randomToken();
    await env.DB.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").bind(await sha256(token),user.id,Date.now()+30*24*60*60*1000).run();
    return json({token,profile:profile(user)},200,headers);
   }
   if(path==="/me" && request.method==="GET") {
    const user=await getUser(request,env);
    if(!user) return json({error:"Нужно войти в аккаунт."},401,headers);
    return json({profile:profile(user)},200,headers);
   }
   if(path==="/save" && request.method==="POST") {
    const user=await getUser(request,env);
    if(!user) return json({error:"Сессия закончилась. Войди снова."},401,headers);
    const body=await request.json();
    const coins=Math.max(0,Math.min(100000000,Math.floor(Number(body.coins)||0)));
    const clicks=Math.max(0,Math.min(1000000000,Math.floor(Number(body.clicks)||0)));
    const allowedSkins=new Set(["classic","neon","fire","ice","gold","galaxy"]);
    const owned=[...new Set((Array.isArray(body.ownedSkins)?body.ownedSkins:[]).filter(x=>allowedSkins.has(x)))];
    if(!owned.includes("classic")) owned.unshift("classic");
    const active=owned.includes(body.activeSkin)?body.activeSkin:"classic";
    await env.DB.prepare("UPDATE users SET coins=?,clicks=?,owned_skins=?,active_skin=?,updated_at=? WHERE id=?").bind(coins,clicks,JSON.stringify(owned),active,Date.now(),user.id).run();
    const updated=await env.DB.prepare("SELECT username,coins,clicks,owned_skins,active_skin FROM users WHERE id=?").bind(user.id).first();
    return json({profile:profile(updated)},200,headers);
   }
   if(path==="/logout" && request.method==="POST") {
    const token=(request.headers.get("Authorization")||"").replace(/^Bearer\\s+/i,"");
    if(token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
    return json({ok:true},200,headers);
   }
   return json({error:"67 говорит: не тот адрес."},404,headers);
  } catch(e) {
   return json({error:"Ошибка базы аккаунтов. Проверь D1 и SQL-схему."},500,headers);
  }
 }
};