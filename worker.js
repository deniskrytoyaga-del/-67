const SYSTEM_PROMPT = `Ты — 67 SUPPORT AI, заместитель директора легендарного сайта 67. Твой характер: абсурдный, смешной, слегка дерзкий, мемный и максимально бесполезный, но доброжелательный. Отвечай по-русски, если пользователь пишет по-русски; подстраивайся под язык пользователя. Иногда вставляй «67», но не в каждое предложение. На вопросы о сайте помогай по делу, если можешь. Не оскорбляй пользователя, не проси личные данные, пароли или секреты. Не выдумывай, что можешь менять сайт, баланс или аккаунты. Короткие ответы предпочтительны.`;

export default {
 async fetch(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = "https://deniskrytoyaga-del.github.io";
  const headers = {
   "Access-Control-Allow-Origin": origin === allowed ? allowed : "null",
   "Access-Control-Allow-Methods": "POST, OPTIONS",
   "Access-Control-Allow-Headers": "Content-Type",
   "Content-Type": "application/json; charset=utf-8",
   "Vary": "Origin"
  };
  if (request.method === "OPTIONS") return new Response(null,{headers});
  const url = new URL(request.url);
  if (url.pathname !== "/chat" || request.method !== "POST")
   return Response.json({error:"67 говорит: не тот адрес."},{status:404,headers});
  if (origin !== allowed) return Response.json({error:"Origin not allowed"},{status:403,headers});
  if (!env.OPENROUTER_API_KEY) return Response.json({error:"На сервере пока нет ключа AI."},{status:503,headers});
  try {
   const body = await request.json();
   if (!Array.isArray(body.messages) || body.messages.length === 0)
    return Response.json({error:"Напиши сообщение."},{status:400,headers});
   const messages = body.messages.slice(-12).map(m => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content || "").slice(0,1200)
   }));
   const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions",{
    method:"POST",
    headers:{
     "Authorization":"Bearer "+env.OPENROUTER_API_KEY,
     "Content-Type":"application/json",
     "HTTP-Referer":"https://deniskrytoyaga-del.github.io/-67/",
     "X-Title":"67 Support AI"
    },
    body:JSON.stringify({
     model:"openrouter/free",
     messages:[{role:"system",content:SYSTEM_PROMPT},...messages],
     max_tokens:220,
     temperature:0.95
    })
   });
   const data=await upstream.json();
   if(!upstream.ok) return Response.json({error:data.error?.message || "Бесплатная модель занята. Попробуй позже."},{status:502,headers});
   const reply=data.choices?.[0]?.message?.content;
   return Response.json({reply: typeof reply === "string" ? reply : "67 временно задумалось."},{headers});
  } catch(e) {
   return Response.json({error:"Ошибка 67-сервера. Попробуй позже."},{status:500,headers});
  }
 }
};