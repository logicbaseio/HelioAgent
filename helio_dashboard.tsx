import { useState, useEffect, useRef } from "react";

const C = {
  bg:"#0a0a0a",panel:"#0f0f0f",border:"#1a1a1a",borderLime:"#c8ff00",
  lime:"#c8ff00",text:"#e0e0e0",muted:"#555",dim:"#2a2a2a",
  red:"#ff4444",orange:"#ff8800",green:"#00ff88",blue:"#4488ff",
};

const AI_PROVIDERS = { anthropic:{label:"Anthropic (Claude)"}, openrouter:{label:"OpenRouter"} };

const OR_MODELS = [
  {id:"openai/gpt-4o",name:"GPT-4o",ctx:"128k",price:"$2.50/$10"},
  {id:"openai/gpt-4o-mini",name:"GPT-4o Mini",ctx:"128k",price:"$0.15/$0.60"},
  {id:"openai/o3-mini",name:"o3 Mini",ctx:"200k",price:"$1.10/$4.40"},
  {id:"anthropic/claude-sonnet-4-5",name:"Claude Sonnet 4.5",ctx:"200k",price:"$3/$15"},
  {id:"anthropic/claude-opus-4-5",name:"Claude Opus 4.5",ctx:"200k",price:"$15/$75"},
  {id:"anthropic/claude-haiku-4-5",name:"Claude Haiku 4.5",ctx:"200k",price:"$0.80/$4"},
  {id:"google/gemini-2.5-pro-preview",name:"Gemini 2.5 Pro",ctx:"1M",price:"$1.25/$10"},
  {id:"google/gemini-2.0-flash-001",name:"Gemini 2.0 Flash",ctx:"1M",price:"$0.10/$0.40"},
  {id:"google/gemini-2.0-flash-exp:free",name:"Gemini 2.0 Flash (Free)",ctx:"1M",price:"Free"},
  {id:"meta-llama/llama-3.3-70b-instruct",name:"Llama 3.3 70B",ctx:"128k",price:"$0.12/$0.30"},
  {id:"mistralai/mistral-large-2411",name:"Mistral Large",ctx:"128k",price:"$2/$6"},
  {id:"deepseek/deepseek-chat-v3-5",name:"DeepSeek Chat V3.5",ctx:"64k",price:"$0.27/$1.10"},
  {id:"deepseek/deepseek-r1",name:"DeepSeek R1",ctx:"64k",price:"$0.55/$2.19"},
  {id:"x-ai/grok-3-beta",name:"Grok 3 Beta",ctx:"131k",price:"$3/$15"},
  {id:"x-ai/grok-3-mini-beta",name:"Grok 3 Mini",ctx:"131k",price:"$0.30/$0.50"},
  {id:"qwen/qwen-2.5-72b-instruct",name:"Qwen 2.5 72B",ctx:"128k",price:"$0.13/$0.40"},
  {id:"cohere/command-r-plus-08-2024",name:"Command R+",ctx:"128k",price:"$2.50/$10"},
];

const INTEGRATION_DEFS = {
  ai:{id:"ai",label:"AI Provider",description:"Powers all Helio intelligence",modules:["mission","audit","gsc","keywords","content","onpage","backlinks","aeo","reports","tasks"],color:C.lime,isAI:true},
  dataforseo:{id:"dataforseo",label:"DataForSEO",description:"Site Audit, Keywords, Backlinks",fields:[{key:"login",label:"API Login",type:"text",placeholder:"your@email.com"},{key:"password",label:"API Password",type:"password",placeholder:"••••••••"}],docsUrl:"https://dataforseo.com/apis",modules:["audit","keywords","backlinks","onpage"],color:C.blue},
  gsc:{id:"gsc",label:"Google Search Console",description:"Performance, coverage, indexing",modules:["gsc"],color:C.green,isOAuth:true,scopes:["https://www.googleapis.com/auth/webmasters.readonly"],docsUrl:"https://console.cloud.google.com"},
  ga4:{id:"ga4",label:"Google Analytics GA4",description:"Traffic, sessions, conversions",modules:["analytics"],color:C.orange,isOAuth:true,scopes:["https://www.googleapis.com/auth/analytics.readonly"],docsUrl:"https://console.cloud.google.com",extraFields:[{key:"propertyId",label:"GA4 Property ID",type:"text",placeholder:"123456789"}]},
  github:{id:"github",label:"GitHub",description:"Code deployments, SEO fixes",fields:[{key:"token",label:"Personal Access Token",type:"password",placeholder:"ghp_xxxxxxxxxxxx"},{key:"repo",label:"Repo (owner/repo)",type:"text",placeholder:"yourname/yoursite"}],docsUrl:"https://github.com/settings/tokens",modules:["github"],color:C.muted},
};

const MODULE_REQUIREMENTS = {
  mission:["ai"],audit:["dataforseo","ai"],keywords:["dataforseo","ai"],
  content:["ai"],onpage:["dataforseo","ai"],backlinks:["dataforseo","ai"],
  gsc:["gsc","ai"],analytics:["ga4","ai"],aeo:["ai"],github:["github","ai"],
  reports:["ai"],tasks:["ai"],integrations:[],
};

const NAV = [
  {id:"mission",icon:"◈",label:"Mission Control"},
  {id:"audit",icon:"⬡",label:"Technical Audit"},
  {id:"keywords",icon:"◉",label:"Keyword Intel"},
  {id:"content",icon:"▣",label:"Content Engine"},
  {id:"onpage",icon:"◧",label:"On-Page SEO"},
  {id:"backlinks",icon:"⬢",label:"Backlink Manager"},
  {id:"gsc",icon:"◈",label:"Search Console"},
  {id:"analytics",icon:"▦",label:"Analytics"},
  {id:"aeo",icon:"◬",label:"AEO / GEO"},
  {id:"github",icon:"⬡",label:"GitHub Ops"},
  {id:"reports",icon:"▤",label:"Reports"},
  {id:"tasks",icon:"▣",label:"Task Manager"},
  {id:"integrations",icon:"⬢",label:"Integrations"},
];

const REDIRECT_URI = "https://www.claudeusercontent.com/";

async function callAI(aiConfig, system, user, history=[]) {
  if (!aiConfig?.connected) throw new Error("AI provider not connected");
  const {provider,apiKey,model} = aiConfig.fields;
  if (provider==="anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},body:JSON.stringify({model,max_tokens:1500,system,messages:[...history,{role:"user",content:user}]})});
    const d = await res.json(); if(d.error) throw new Error(d.error.message); return d.content?.[0]?.text||"";
  }
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${apiKey}`,"HTTP-Referer":"https://helio-seo.app","X-Title":"Helio SEO Agent"},body:JSON.stringify({model,messages:[{role:"system",content:system},...history,{role:"user",content:user}]})});
  const d = await res.json(); if(d.error) throw new Error(d.error.message); return d.choices?.[0]?.message?.content||"";
}

// ── Shared UI ─────────────────────────────────────────────────────
const TermLog = ({lines,running})=>{
  const ref=useRef();
  useEffect(()=>{if(ref.current)ref.current.scrollTop=ref.current.scrollHeight;},[lines]);
  return <div ref={ref} style={{background:"#060606",border:`1px solid ${C.dim}`,fontFamily:"monospace",fontSize:11,padding:14,height:180,overflowY:"auto",scrollbarWidth:"thin"}}>
    {lines.map((l,i)=><div key={i} style={{marginBottom:3,display:"flex",gap:10}}>
      <span style={{color:C.muted,minWidth:50,flexShrink:0}}>{String(Math.floor((l.t||i*200)/1000)).padStart(2,"0")}:{String(Math.floor(((l.t||i*200)%1000)/10)).padStart(2,"0")}</span>
      <span style={{color:l.type==="sys"?C.lime:l.type==="ok"?C.green:l.type==="warn"?C.orange:l.type==="err"?C.red:C.text,whiteSpace:"pre-wrap"}}>{l.msg}</span>
    </div>)}
    {running&&<div style={{display:"flex",gap:10}}><span style={{color:C.muted,minWidth:50}}>--:--</span><span style={{color:C.lime}}>█</span></div>}
  </div>;
};

const Hdr = ({title,sub})=><div style={{marginBottom:22}}>
  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:3}}><div style={{width:3,height:18,background:C.lime}}/><span style={{color:C.lime,fontFamily:"monospace",fontSize:14,fontWeight:700,letterSpacing:2}}>{title.toUpperCase()}</span></div>
  {sub&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:11,paddingLeft:13}}>{sub}</div>}
</div>;

const Tabs = ({tabs,active,onChange})=><div style={{display:"flex",borderBottom:`1px solid ${C.border}`,marginBottom:18}}>
  {tabs.map(t=><div key={t} onClick={()=>onChange(t)} style={{padding:"7px 20px",fontFamily:"monospace",fontSize:10,cursor:"pointer",letterSpacing:1,color:active===t?C.lime:C.muted,textTransform:"uppercase",borderBottom:active===t?`2px solid ${C.lime}`:"2px solid transparent"}}>{t}</div>)}
</div>;

const Card = ({label,value,delta,good})=><div style={{background:C.panel,border:`1px solid ${C.border}`,padding:"12px 16px",flex:1,minWidth:110}}>
  <div style={{color:C.muted,fontSize:9,fontFamily:"monospace",marginBottom:5,textTransform:"uppercase",letterSpacing:1}}>{label}</div>
  <div style={{color:C.lime,fontSize:20,fontFamily:"monospace",fontWeight:700}}>{value??"—"}</div>
  {delta!==undefined&&<div style={{color:good?C.green:C.red,fontSize:10,fontFamily:"monospace",marginTop:3}}>{delta}</div>}
</div>;

const Btn = ({onClick,disabled,children,variant="lime",style={}})=>{
  const bg = disabled?C.dim:variant==="lime"?C.lime:variant==="green"?C.green:variant==="red"?C.red:variant==="orange"?C.orange:C.blue;
  return <button onClick={onClick} disabled={disabled} style={{background:bg,color:disabled?"#888":"#000",border:"none",cursor:disabled?"not-allowed":"pointer",fontFamily:"monospace",fontWeight:700,fontSize:11,padding:"9px 20px",letterSpacing:2,...style}}>{children}</button>;
};

const Input = ({label,type="text",value,onChange,placeholder,note})=><div>
  {label&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:5}}>{label.toUpperCase()}</div>}
  <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
    style={{width:"100%",background:"#060606",border:`1px solid ${value?C.dim:"#111"}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none",boxSizing:"border-box"}}/>
  {note&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginTop:4}}>{note}</div>}
</div>;

function Gate({moduleId,integrations,children}) {
  const missing=(MODULE_REQUIREMENTS[moduleId]||[]).filter(id=>!integrations[id]?.connected);
  if (!missing.length) return children;
  return <div style={{padding:28,flex:1}}><div style={{background:C.panel,border:`1px solid ${C.red}`,padding:28}}>
    <div style={{color:C.red,fontFamily:"monospace",fontSize:12,fontWeight:700,letterSpacing:2,marginBottom:14}}>⚠ MODULE LOCKED</div>
    <div style={{color:C.muted,fontFamily:"monospace",fontSize:11,marginBottom:18}}>Connect the following integrations first:</div>
    {missing.map(id=>{const def=INTEGRATION_DEFS[id]; return <div key={id} style={{display:"flex",alignItems:"center",gap:14,padding:"10px 14px",background:"#060606",border:`1px solid ${C.dim}`,marginBottom:8}}>
      <span style={{color:C.red,fontFamily:"monospace"}}>✗</span>
      <span style={{color:def?.color||C.lime,fontFamily:"monospace",fontSize:11,fontWeight:700,minWidth:180}}>{def?.label}</span>
      <span style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>{def?.description}</span>
    </div>;})}
    <div style={{color:C.muted,fontFamily:"monospace",fontSize:11,marginTop:14}}>→ Go to <span style={{color:C.lime}}>INTEGRATIONS</span> in sidebar.</div>
  </div></div>;
}

// ── AI Provider Panel ─────────────────────────────────────────────
function AIPanel({integrations,setIntegrations}) {
  const saved=integrations.ai||{connected:false,fields:{}};
  const [provider,setProvider]=useState(saved.fields?.provider||"anthropic");
  const [apiKey,setApiKey]=useState(saved.fields?.apiKey||"");
  const [model,setModel]=useState(saved.fields?.model||"claude-sonnet-4-20250514");
  const [search,setSearch]=useState("");
  const [showDrop,setShowDrop]=useState(false);
  const [testing,setTesting]=useState(false);
  const [log,setLog]=useState([]);
  const [ok,setOk]=useState(false);
  const dropRef=useRef();
  const ANTH=[{id:"claude-sonnet-4-20250514",name:"Claude Sonnet 4 (Recommended)"},{id:"claude-opus-4-5",name:"Claude Opus 4.5"},{id:"claude-haiku-4-5-20251001",name:"Claude Haiku 4.5 (Fast)"}];
  const addLog=(msg,type="info")=>setLog(p=>[...p,{msg,type,t:p.length*300}]);

  useEffect(()=>{const h=e=>{if(dropRef.current&&!dropRef.current.contains(e.target))setShowDrop(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);

  const filtered=OR_MODELS.filter(m=>m.name.toLowerCase().includes(search.toLowerCase())||m.id.toLowerCase().includes(search.toLowerCase()));

  const test=async()=>{
    setTesting(true);setLog([]);setOk(false);
    addLog(`Testing ${AI_PROVIDERS[provider].label}...`,"sys");
    try {
      if (provider==="anthropic") {
        const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},body:JSON.stringify({model,max_tokens:10,messages:[{role:"user",content:"ping"}]})});
        const d=await res.json();
        if(d.content){addLog(`✓ Connected. Model: ${model}`,"ok");setOk(true);}
        else{addLog(`Error: ${d.error?.message}`,"err");}
      } else {
        const res=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${apiKey}`,"HTTP-Referer":"https://helio-seo.app","X-Title":"Helio"},body:JSON.stringify({model,messages:[{role:"user",content:"ping"}],max_tokens:5})});
        const d=await res.json();
        if(d.choices?.[0]){addLog(`✓ OpenRouter live. Model: ${model}`,"ok");setOk(true);}
        else{addLog(`Error: ${d.error?.message}`,"err");}
      }
    } catch(e){addLog(`Failed: ${e.message}`,"err");}
    setTesting(false);
  };

  const save=()=>{
    setIntegrations(p=>({...p,ai:{connected:true,fields:{provider,apiKey,model},connectedAt:new Date().toLocaleString()}}));
    addLog("✓ Saved.","ok");
  };
  const disconnect=()=>setIntegrations(p=>({...p,ai:{connected:false,fields:{}}}));

  if (saved.connected) return <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:22}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}>
      <div style={{color:C.lime,fontFamily:"monospace",fontSize:13,fontWeight:700,letterSpacing:2}}>AI PROVIDER</div>
      <Btn onClick={disconnect} variant="red">DISCONNECT</Btn>
    </div>
    <div style={{background:"#060f06",border:`1px solid ${C.green}`,padding:14}}>
      <div style={{color:C.green,fontFamily:"monospace",fontSize:11,marginBottom:6}}>✓ CONNECTED — {saved.connectedAt}</div>
      <div style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>Provider: <span style={{color:C.text}}>{AI_PROVIDERS[saved.fields.provider]?.label}</span></div>
      <div style={{color:C.muted,fontFamily:"monospace",fontSize:10,marginTop:3}}>Model: <span style={{color:C.lime}}>{saved.fields.model}</span></div>
    </div>
  </div>;

  return <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:22}}>
    <div style={{color:C.lime,fontFamily:"monospace",fontSize:13,fontWeight:700,letterSpacing:2,marginBottom:16}}>AI PROVIDER</div>
    <div style={{display:"flex",marginBottom:18}}>
      {Object.entries(AI_PROVIDERS).map(([k,p])=><div key={k} onClick={()=>{setProvider(k);setModel(k==="anthropic"?"claude-sonnet-4-20250514":"");setLog([]);setOk(false);}}
        style={{flex:1,padding:"11px 0",textAlign:"center",cursor:"pointer",fontFamily:"monospace",fontSize:11,fontWeight:700,letterSpacing:1,background:provider===k?C.lime:"#060606",color:provider===k?"#000":C.muted,border:`1px solid ${provider===k?C.lime:C.dim}`,marginRight:k==="anthropic"?-1:0}}>{p.label}</div>)}
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:18}}>
      <Input label={provider==="anthropic"?"Anthropic API Key":"OpenRouter API Key"} type="password" value={apiKey} onChange={setApiKey}
        placeholder={provider==="anthropic"?"sk-ant-xxxx":"sk-or-xxxx"} note={provider==="anthropic"?"→ console.anthropic.com":"→ openrouter.ai/keys"}/>
      <div>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:5}}>SELECT MODEL</div>
        {provider==="anthropic"
          ? <select value={model} onChange={e=>setModel(e.target.value)} style={{width:"100%",background:"#060606",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none"}}>
              {ANTH.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          : <div ref={dropRef} style={{position:"relative"}}>
              <input value={model} onChange={e=>setModel(e.target.value)} onFocus={()=>setShowDrop(true)} placeholder="openai/gpt-4o or type any model ID"
                style={{width:"100%",background:"#060606",border:`1px solid ${model?C.lime:C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none",boxSizing:"border-box"}}/>
              {showDrop&&<div style={{position:"absolute",top:"100%",left:0,right:0,background:"#0d0d0d",border:`1px solid ${C.lime}`,zIndex:200,maxHeight:240,display:"flex",flexDirection:"column"}}>
                <input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder={`Search ${OR_MODELS.length} models...`}
                  style={{padding:"7px 10px",background:"#0a0a0a",border:"none",borderBottom:`1px solid ${C.dim}`,outline:"none",color:C.text,fontFamily:"monospace",fontSize:10}}/>
                <div style={{overflowY:"auto",scrollbarWidth:"thin"}}>
                  {filtered.map(m=><div key={m.id} onClick={()=>{setModel(m.id);setShowDrop(false);setSearch("");}}
                    style={{padding:"9px 12px",cursor:"pointer",background:model===m.id?"#111800":"transparent",borderBottom:`1px solid ${C.border}`}}>
                    <div style={{color:model===m.id?C.lime:C.text,fontFamily:"monospace",fontSize:10}}>{m.name}</div>
                    <div style={{color:C.muted,fontFamily:"monospace",fontSize:8,marginTop:2}}>{m.id} · ctx:{m.ctx} · {m.price}/1M</div>
                  </div>)}
                </div>
              </div>}
            </div>
        }
      </div>
    </div>
    <div style={{display:"flex",gap:10}}>
      <Btn onClick={test} disabled={testing||!apiKey||!model}>{testing?"TESTING...":"TEST CONNECTION"}</Btn>
      {ok&&<Btn onClick={save} variant="green">SAVE & CONNECT ✓</Btn>}
    </div>
    {log.length>0&&<div style={{marginTop:14}}><TermLog lines={log} running={testing}/></div>}
  </div>;
}

// ── Google OAuth Panel ────────────────────────────────────────────
function OAuthPanel({id,integrations,setIntegrations}) {
  const def=INTEGRATION_DEFS[id];
  const saved=integrations[id]||{connected:false,fields:{}};
  const [clientId,setClientId]=useState(saved.fields?.clientId||"");
  const [clientSecret,setClientSecret]=useState(saved.fields?.clientSecret||"");
  const [extra,setExtra]=useState(saved.fields?.extra||{});
  const [step,setStep]=useState("config");
  const [authCode,setAuthCode]=useState("");
  const [manualToken,setManualToken]=useState("");
  const [manualRefresh,setManualRefresh]=useState("");
  const [exchanging,setExchanging]=useState(false);
  const [log,setLog]=useState([]);
  const addLog=(msg,type="info")=>setLog(p=>[...p,{msg,type,t:p.length*300}]);

  const authUrl=clientId&&clientSecret?`https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({client_id:clientId,redirect_uri:REDIRECT_URI,response_type:"code",scope:def.scopes.join(" "),access_type:"offline",prompt:"consent"})}`:null;

  const exchangeCode=async()=>{
    setExchanging(true);
    let code=authCode.trim();
    if(code.includes("code="))try{code=new URL(code).searchParams.get("code")||code;}catch{code=code.split("code=")[1]?.split("&")[0]||code;}
    addLog(`Code: ${code.slice(0,20)}...`,"sys");
    try {
      const res=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:REDIRECT_URI,grant_type:"authorization_code"})});
      const d=await res.json();
      if(d.access_token){
        const fields={clientId,clientSecret,accessToken:d.access_token,refreshToken:d.refresh_token||"",expiresAt:Date.now()+(d.expires_in*1000),extra};
        setIntegrations(p=>({...p,[id]:{connected:true,fields,connectedAt:new Date().toLocaleString()}}));
        addLog("✓ Connected!","ok");setStep("done");
      } else {
        addLog(`Failed: ${d.error_description||d.error}. CORS blocked — use curl below.`,"err");
        const curlCmd=`curl -X POST https://oauth2.googleapis.com/token -d "code=${code}&client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${REDIRECT_URI}&grant_type=authorization_code"`;
        addLog(curlCmd,"sys");setStep("manual");
      }
    } catch(e){
      addLog(`CORS blocked. Run this in terminal:`,"err");
      addLog(`curl -X POST https://oauth2.googleapis.com/token -d "code=${code}&client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${REDIRECT_URI}&grant_type=authorization_code"`,"sys");
      setStep("manual");
    }
    setExchanging(false);
  };

  const saveManual=()=>{
    const fields={clientId,clientSecret,accessToken:manualToken.trim(),refreshToken:manualRefresh.trim(),expiresAt:Date.now()+3600000,extra};
    setIntegrations(p=>({...p,[id]:{connected:true,fields,connectedAt:new Date().toLocaleString()}}));
  };

  const disconnect=()=>{setIntegrations(p=>({...p,[id]:{connected:false,fields:{}}}));setStep("config");setLog([]);};

  if(saved.connected){const exp=saved.fields?.expiresAt&&Date.now()>saved.fields.expiresAt;return <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:22}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
      <div style={{color:C.lime,fontFamily:"monospace",fontSize:13,fontWeight:700,letterSpacing:2}}>{def.label.toUpperCase()}</div>
      <Btn onClick={disconnect} variant="red">DISCONNECT</Btn>
    </div>
    <div style={{background:exp?"#1a0a00":"#060f06",border:`1px solid ${exp?C.orange:C.green}`,padding:14}}>
      <div style={{color:exp?C.orange:C.green,fontFamily:"monospace",fontSize:11,marginBottom:6}}>{exp?"⚠ TOKEN EXPIRED":"✓ CONNECTED"} — {saved.connectedAt}</div>
      {saved.fields?.extra?.propertyId&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>Property ID: <span style={{color:C.lime}}>{saved.fields.extra.propertyId}</span></div>}
    </div>
    <div style={{display:"flex",gap:10,marginTop:12}}>
      <Btn onClick={async()=>{try{const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({refresh_token:saved.fields.refreshToken,client_id:saved.fields.clientId,client_secret:saved.fields.clientSecret,grant_type:"refresh_token"})});const d=await r.json();if(d.access_token)setIntegrations(p=>({...p,[id]:{...p[id],fields:{...p[id].fields,accessToken:d.access_token,expiresAt:Date.now()+(d.expires_in*1000)}}}));}catch(e){}}}>↺ REFRESH</Btn>
      <Btn onClick={disconnect} variant="orange" style={{background:"transparent",border:`1px solid ${C.lime}`,color:C.lime}}>RE-AUTHORIZE</Btn>
    </div>
  </div>;}

  return <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:22}}>
    <div style={{color:C.lime,fontFamily:"monospace",fontSize:13,fontWeight:700,letterSpacing:2,marginBottom:16}}>{def.label.toUpperCase()}</div>
    <div style={{background:"#0d1117",border:`1px solid ${C.dim}`,padding:14,marginBottom:18,fontFamily:"monospace",fontSize:10,color:C.muted,lineHeight:1.9}}>
      <div style={{color:C.lime,marginBottom:8}}>SETUP — GOOGLE CLOUD CONSOLE</div>
      1. <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{color:C.blue}}>console.cloud.google.com</a> → APIs & Services → Credentials<br/>
      2. Create OAuth 2.0 Client ID → Web application<br/>
      3. Authorized redirect URI: <span style={{color:C.lime}}>https://www.claudeusercontent.com/</span><br/>
      4. Enable: <span style={{color:C.text}}>{id==="gsc"?"Google Search Console API":"Google Analytics Data API"}</span><br/>
      5. Paste credentials below → Generate URL → Authorize → Paste code back
    </div>
    <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
      <Input label="Client ID" value={clientId} onChange={setClientId} placeholder="xxxxxxx.apps.googleusercontent.com"/>
      <Input label="Client Secret" type="password" value={clientSecret} onChange={setClientSecret} placeholder="GOCSPX-xxxx"/>
      {def.extraFields?.map(f=><Input key={f.key} label={f.label} type={f.type} value={extra[f.key]||""} onChange={v=>setExtra(p=>({...p,[f.key]:v}))} placeholder={f.placeholder}/>)}
    </div>
    {authUrl&&<><a href={authUrl} target="_blank" rel="noreferrer" style={{display:"inline-block",background:C.lime,color:"#000",fontFamily:"monospace",fontWeight:700,fontSize:11,padding:"9px 20px",letterSpacing:2,textDecoration:"none",marginBottom:14}}>STEP 1 — OPEN GOOGLE AUTHORIZATION ↗</a>
    <div style={{background:"#0a1400",border:`1px solid ${C.green}`,padding:14,marginBottom:14}}>
      <div style={{color:C.green,fontFamily:"monospace",fontSize:10,fontWeight:700,marginBottom:8}}>STEP 2 — PASTE REDIRECT URL OR CODE</div>
      <input value={authCode} onChange={e=>setAuthCode(e.target.value)} placeholder="Paste full redirect URL or just the code= value"
        style={{width:"100%",background:"#060606",border:`1px solid ${authCode?C.lime:C.dim}`,color:C.text,fontFamily:"monospace",fontSize:10,padding:"9px 12px",outline:"none",boxSizing:"border-box",marginBottom:10}}/>
      <Btn onClick={exchangeCode} disabled={exchanging||!authCode} variant="green">{exchanging?"EXCHANGING...":"STEP 3 — EXCHANGE FOR TOKEN"}</Btn>
    </div></>}
    {!authUrl&&clientId&&clientSecret&&<Btn onClick={()=>{}}>GENERATE AUTH URL</Btn>}
    {step==="manual"&&<div style={{background:"#1a0a00",border:`1px solid ${C.orange}`,padding:14,marginBottom:14}}>
      <div style={{color:C.orange,fontFamily:"monospace",fontSize:10,fontWeight:700,marginBottom:10}}>CORS BLOCKED — PASTE TOKEN MANUALLY</div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        <Input label="Access Token (from curl response)" type="password" value={manualToken} onChange={setManualToken} placeholder="ya29.xxxxxxx"/>
        <Input label="Refresh Token (optional)" type="password" value={manualRefresh} onChange={setManualRefresh} placeholder="1//xxxxxxxxx"/>
        <Btn onClick={saveManual} disabled={!manualToken} variant="orange">SAVE TOKEN & CONNECT ✓</Btn>
      </div>
    </div>}
    {log.length>0&&<TermLog lines={log} running={exchanging}/>}
  </div>;
}

// ── Standard Creds Panel ──────────────────────────────────────────
function CredsPanel({id,integrations,setIntegrations}) {
  const def=INTEGRATION_DEFS[id];
  const saved=integrations[id]||{connected:false,fields:{}};
  const [fields,setFields]=useState(saved.fields||{});
  const [testing,setTesting]=useState(false);
  const [log,setLog]=useState([]);
  const [ok,setOk]=useState(false);
  const addLog=(msg,type="info")=>setLog(p=>[...p,{msg,type,t:p.length*400}]);

  const test=async()=>{
    setTesting(true);setLog([]);setOk(false);addLog(`Testing ${def.label}...`,"sys");
    try {
      if(id==="dataforseo"){
        const res=await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Basic "+btoa(`${fields.login}:${fields.password}`)},body:JSON.stringify([{keyword:"test",language_code:"en",location_code:2840,device:"desktop",depth:1}])});
        const d=await res.json();
        if(d.status_code===20000||d.tasks?.[0]?.status_code===20000){addLog("✓ DataForSEO authenticated.","ok");setOk(true);}
        else{addLog(`Error: ${d.status_message}`,"err");}
      } else if(id==="github"){
        const res=await fetch(`https://api.github.com/repos/${fields.repo}`,{headers:{"Authorization":`token ${fields.token}`,"Accept":"application/vnd.github.v3+json"}});
        const d=await res.json();
        if(res.ok){addLog(`✓ Repo "${d.full_name}" connected. Branch: ${d.default_branch}.`,"ok");setOk(true);}
        else{addLog(`Error: ${d.message}`,"err");}
      }
    } catch(e){addLog(`Failed: ${e.message}`,"err");}
    setTesting(false);
  };

  if(saved.connected)return <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:22}}>
    <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
      <div style={{color:C.lime,fontFamily:"monospace",fontSize:13,fontWeight:700,letterSpacing:2}}>{def.label.toUpperCase()}</div>
      <Btn onClick={()=>setIntegrations(p=>({...p,[id]:{connected:false,fields:{}}}))} variant="red">DISCONNECT</Btn>
    </div>
    <div style={{background:"#060f06",border:`1px solid ${C.green}`,padding:14}}>
      <div style={{color:C.green,fontFamily:"monospace",fontSize:11}}>✓ CONNECTED — {saved.connectedAt}</div>
      <div style={{color:C.muted,fontFamily:"monospace",fontSize:10,marginTop:4}}>Powers: {def.modules.map(m=>NAV.find(n=>n.id===m)?.label).filter(Boolean).join(", ")}</div>
    </div>
  </div>;

  return <div style={{background:C.panel,border:`1px solid ${C.border}`,padding:22}}>
    <div style={{color:C.lime,fontFamily:"monospace",fontSize:13,fontWeight:700,letterSpacing:2,marginBottom:16}}>{def.label.toUpperCase()}</div>
    <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:16}}>
      {def.fields?.map(f=><Input key={f.key} label={f.label} type={f.type} value={fields[f.key]||""} onChange={v=>setFields(p=>({...p,[f.key]:v}))} placeholder={f.placeholder}/>)}
    </div>
    <div style={{display:"flex",gap:10}}>
      <Btn onClick={test} disabled={testing}>{testing?"TESTING...":"TEST CONNECTION"}</Btn>
      {ok&&<Btn onClick={()=>{setIntegrations(p=>({...p,[id]:{connected:true,fields,connectedAt:new Date().toLocaleString()}}));addLog("✓ Saved.","ok");}} variant="green">SAVE & CONNECT ✓</Btn>}
      <a href={def.docsUrl} target="_blank" rel="noreferrer" style={{color:C.muted,fontFamily:"monospace",fontSize:10,alignSelf:"center",textDecoration:"none"}}>→ Docs ↗</a>
    </div>
    {log.length>0&&<div style={{marginTop:14}}><TermLog lines={log} running={testing}/></div>}
  </div>;
}

// ── INTEGRATIONS MODULE ───────────────────────────────────────────
function Integrations({integrations,setIntegrations}) {
  const [sel,setSel]=useState("ai");
  const connCount=Object.values(integrations).filter(v=>v.connected).length;
  const renderPanel=()=>{
    if(sel==="ai")return <AIPanel integrations={integrations} setIntegrations={setIntegrations}/>;
    if(INTEGRATION_DEFS[sel]?.isOAuth)return <OAuthPanel id={sel} integrations={integrations} setIntegrations={setIntegrations}/>;
    return <CredsPanel id={sel} integrations={integrations} setIntegrations={setIntegrations}/>;
  };
  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Integrations" sub="Connect all services to power Helio's real-data modules"/>
    <div style={{display:"flex",gap:8,marginBottom:24,flexWrap:"wrap"}}>
      {Object.entries(INTEGRATION_DEFS).map(([id,def])=>{const c=integrations[id]?.connected;return <div key={id} style={{background:C.panel,border:`1px solid ${c?C.lime:C.dim}`,padding:"7px 12px",display:"flex",alignItems:"center",gap:7}}>
        <div style={{width:6,height:6,borderRadius:"50%",background:c?C.green:C.red}}/><span style={{color:c?C.lime:C.muted,fontFamily:"monospace",fontSize:9}}>{def.label}</span>
      </div>;})}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"200px 1fr",gap:18}}>
      <div style={{background:C.panel,border:`1px solid ${C.border}`}}>
        {Object.entries(INTEGRATION_DEFS).map(([id,def])=>{const c=integrations[id]?.connected;return <div key={id} onClick={()=>setSel(id)} style={{padding:"11px 14px",cursor:"pointer",borderBottom:`1px solid ${C.border}`,background:sel===id?"#111800":"transparent",borderLeft:sel===id?`3px solid ${C.lime}`:"3px solid transparent"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span style={{color:sel===id?C.lime:C.text,fontFamily:"monospace",fontSize:11}}>{def.label}</span>
            <div style={{display:"flex",gap:5,alignItems:"center"}}>
              {def.isOAuth&&<span style={{color:C.blue,fontFamily:"monospace",fontSize:7,border:`1px solid ${C.blue}`,padding:"1px 4px"}}>OAUTH</span>}
              <span style={{color:c?C.green:C.red,fontFamily:"monospace",fontSize:8}}>{c?"✓":"✗"}</span>
            </div>
          </div>
          <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginTop:2}}>{id==="ai"&&c?integrations.ai.fields.model?.split("/").pop()?.slice(0,22):def.description.split(",")[0]}</div>
        </div>;})}
      </div>
      <div>{renderPanel()}</div>
    </div>
  </div>;
}

// ── MISSION CONTROL ───────────────────────────────────────────────
function Mission({integrations,agentOnline,setAgentOnline}) {
  const ai=integrations.ai;
  const [logs,setLogs]=useState([]);
  const [booting,setBooting]=useState(false);
  const [chat,setChat]=useState([]);
  const [responding,setResponding]=useState(false);
  const [cmd,setCmd]=useState("");
  const hist=useRef([]);
  const addLog=(msg,type="info",t=0)=>setLogs(p=>[...p,{msg,type,t}]);

  const boot=()=>{
    setBooting(true);setLogs([]);
    const msgs=[
      {t:0,msg:"HELIO AGENT v1.0 — INITIALIZING...",type:"sys"},
      {t:400,msg:`AI: ${ai?.fields?.provider?.toUpperCase()} · ${ai?.fields?.model}`,type:"ok"},
      ...Object.entries(INTEGRATION_DEFS).filter(([id])=>id!=="ai").map(([id,def],i)=>({t:700+i*300,msg:`${integrations[id]?.connected?"[OK]":"[--]"} ${def.label}`,type:integrations[id]?.connected?"ok":"warn"})),
      {t:700+Object.keys(INTEGRATION_DEFS).length*300,msg:"Agent operational. Awaiting commands.",type:"sys"},
    ];
    msgs.forEach((l,i)=>setTimeout(()=>{setLogs(p=>[...p,l]);if(i===msgs.length-1){setBooting(false);setAgentOnline(true);}},l.t));
  };

  const send=async(c)=>{
    setChat(p=>[...p,{role:"user",text:c,ts:new Date().toLocaleTimeString()}]);setResponding(true);
    try{const r=await callAI(ai,"You are Helio, elite autonomous SEO agent. Terminal style, under 150 words, [MODULE][ACTION][STATUS] tags.",c,hist.current);
      hist.current=[...hist.current,{role:"user",content:c},{role:"assistant",content:r}];
      setChat(p=>[...p,{role:"agent",text:r,ts:new Date().toLocaleTimeString()}]);
    }catch(e){setChat(p=>[...p,{role:"agent",text:`[ERROR] ${e.message}`,ts:""}]);}
    setResponding(false);
  };

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Mission Control" sub={`Agent command interface · ${ai?.fields?.model||"No AI connected"}`}/>
    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
      {Object.entries(INTEGRATION_DEFS).map(([id,def])=>{const c=integrations[id]?.connected;return <div key={id} style={{background:C.panel,border:`1px solid ${c?C.lime:C.dim}`,padding:"7px 12px",display:"flex",alignItems:"center",gap:7}}>
        <div style={{width:5,height:5,borderRadius:"50%",background:c?C.green:C.red}}/><span style={{color:c?C.lime:C.muted,fontFamily:"monospace",fontSize:9}}>{id==="ai"&&c?ai.fields.model.split("/").pop():def.label}</span>
      </div>;})}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18,marginBottom:20}}>
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2}}>▶ AGENT TERMINAL</div>
          {!agentOnline&&<Btn onClick={boot} disabled={booting||!ai?.connected}>{booting?"BOOTING...":"BOOT AGENT"}</Btn>}
        </div>
        <TermLog lines={logs} running={booting}/>
        {!ai?.connected&&<div style={{color:C.orange,fontFamily:"monospace",fontSize:10,marginTop:8}}>⚠ Connect AI Provider in Integrations first.</div>}
      </div>
      <div>
        <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2,marginBottom:10}}>◈ COMMAND INTERFACE</div>
        <div style={{background:"#060606",border:`1px solid ${C.border}`,padding:12,height:148,overflowY:"auto",scrollbarWidth:"thin",marginBottom:0}}>
          {chat.length===0&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>Boot agent then give a command. e.g. "Audit generalizingai.com" or "Build a 3-month content plan"</div>}
          {chat.map((r,i)=><div key={i} style={{marginBottom:8}}>
            <div style={{color:C.muted,fontFamily:"monospace",fontSize:8,marginBottom:2}}>{r.role==="user"?"YOU":"HELIO"} · {r.ts}</div>
            <div style={{fontFamily:"monospace",fontSize:10,whiteSpace:"pre-wrap",color:r.role==="user"?C.text:C.lime,paddingLeft:r.role==="agent"?8:0,borderLeft:r.role==="agent"?`2px solid ${C.lime}`:"none"}}>{r.text}</div>
          </div>)}
          {responding&&<div style={{color:C.lime,fontFamily:"monospace",fontSize:10}}>HELIO ▶ processing █</div>}
        </div>
        <div style={{display:"flex",border:`1px solid ${C.borderLime}`,background:"#060606",marginTop:8}}>
          <span style={{color:C.lime,fontFamily:"monospace",padding:"8px 10px",fontSize:11}}>HELIO&gt;</span>
          <input value={cmd} onChange={e=>setCmd(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&cmd.trim()&&agentOnline){send(cmd);setCmd("");}}}
            placeholder={agentOnline?"Command...":"Boot agent first"} disabled={!agentOnline}
            style={{flex:1,background:"transparent",border:"none",outline:"none",color:C.text,fontFamily:"monospace",fontSize:10,padding:"8px 0"}}/>
          <button onClick={()=>{if(cmd.trim()&&agentOnline){send(cmd);setCmd("");}}} style={{background:C.lime,color:"#000",border:"none",cursor:"pointer",fontFamily:"monospace",fontWeight:700,fontSize:10,padding:"0 14px"}}>EXEC</button>
        </div>
      </div>
    </div>
  </div>;
}

// ── TECHNICAL AUDIT ───────────────────────────────────────────────
function Audit({integrations}) {
  const ai=integrations.ai;const dfs=integrations.dataforseo?.fields;
  const [domain,setDomain]=useState("");const [running,setRunning]=useState(false);
  const [logs,setLogs]=useState([]);const [results,setResults]=useState(null);
  const [tab,setTab]=useState("overview");const [fixLog,setFixLog]=useState([]);const [fixing,setFixing]=useState(false);
  const addLog=(msg,type="info")=>setLogs(p=>[...p,{msg,type,t:p.length*600}]);

  const run=async()=>{
    if(!domain)return;setRunning(true);setLogs([]);setResults(null);
    addLog("Initializing crawl engine...","sys");addLog(`Target: ${domain}`);
    try{
      const auth="Basic "+btoa(`${dfs.login}:${dfs.password}`);
      addLog("Creating DataForSEO task...");
      const t=await(await fetch("https://api.dataforseo.com/v3/on_page/task_post",{method:"POST",headers:{"Content-Type":"application/json","Authorization":auth},body:JSON.stringify([{target:domain,max_crawl_pages:100,load_resources:true,enable_javascript:false}])})).json();
      if(t.tasks?.[0]?.status_code===20100){
        const tid=t.tasks[0].id;addLog(`Task ID: ${tid}`,"ok");addLog("Crawling... (30-60s)");
        let ready=false,att=0;
        while(!ready&&att<20){await new Promise(r=>setTimeout(r,5000));att++;addLog(`Status check ${att}...`);
          const s=await(await fetch(`https://api.dataforseo.com/v3/on_page/summary/${tid}`,{headers:{"Authorization":auth}})).json();
          const sum=s.tasks?.[0]?.result?.[0];
          if(sum?.crawl_progress==="finished"){ready=true;addLog("Crawl done. Fetching pages...","ok");
            const pg=await(await fetch(`https://api.dataforseo.com/v3/on_page/pages/${tid}`,{method:"POST",headers:{"Content-Type":"application/json","Authorization":auth},body:JSON.stringify([{limit:50}])})).json();
            setResults({summary:sum,pages:pg.tasks?.[0]?.result?.[0]?.items||[]});addLog("AUDIT COMPLETE.","ok");
          }
        }
        if(!ready)addLog("Timeout. Try again.","warn");
      }else addLog(`Error: ${t.tasks?.[0]?.status_message}`,"err");
    }catch(e){addLog(`Error: ${e.message}`,"err");}
    setRunning(false);
  };

  const fix=async(issue)=>{
    setFixing(true);setFixLog([]);setTab("fixes");
    const a=(msg,type="info")=>setFixLog(p=>[...p,{msg,type,t:p.length*400}]);
    a(`Analyzing: ${issue}`,"sys");a("Generating fix plan...");
    try{const r=await callAI(ai,"You are Helio SEO agent. Produce a precise numbered fix plan. Max 120 words. Name specific files/configs. Terminal style.",`Fix: ${issue}`);a("─── FIX PLAN ───","sys");a(r,"ok");a("─── DEPLOY VIA GITHUB OPS ───","sys");}
    catch(e){a(`Error: ${e.message}`,"err");}
    setFixing(false);
  };

  const s=results?.summary;
  const checks=[{label:"Missing meta descriptions",v:s?.checks?.no_description},{label:"Missing H1 tags",v:s?.checks?.no_h1_tag},{label:"Broken internal links",v:s?.broken_links},{label:"Missing image alt text",v:s?.checks?.no_image_alt},{label:"Pages with noindex",v:s?.checks?.no_index_page},{label:"Duplicate title tags",v:s?.duplicate_title},{label:"High load time pages",v:s?.checks?.high_loading_time},{label:"Broken pages (4xx/5xx)",v:s?.broken_pages}];

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Technical Audit" sub={`DataForSEO site crawl · AI: ${ai?.fields?.model||"—"}`}/>
    <div style={{display:"flex",gap:10,marginBottom:18}}>
      <input value={domain} onChange={e=>setDomain(e.target.value)} placeholder="Domain to audit (e.g. generalizingai.com)"
        style={{flex:1,background:"#060606",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none"}}/>
      <Btn onClick={run} disabled={running||!domain}>{running?"▶ AUDITING...":"⬡ RUN AUDIT"}</Btn>
    </div>
    {logs.length>0&&<div style={{marginBottom:18}}><TermLog lines={logs} running={running}/></div>}
    {results&&<>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
        {[{label:"Pages Crawled",value:s?.pages_crawled},{label:"Broken Pages",value:s?.broken_pages,delta:(s?.broken_pages??0)===0?"✓ Good":"⚠ Fix",good:(s?.broken_pages??0)===0},{label:"Missing H1",value:s?.checks?.no_h1_tag,delta:(s?.checks?.no_h1_tag??0)===0?"✓ Good":"⚠ Fix",good:(s?.checks?.no_h1_tag??0)===0},{label:"No Description",value:s?.checks?.no_description,delta:(s?.checks?.no_description??0)===0?"✓ Good":"⚠ Fix",good:(s?.checks?.no_description??0)===0}].map((m,i)=><Card key={i} {...m}/>)}
      </div>
      <Tabs tabs={["overview","pages","fixes"]} active={tab} onChange={setTab}/>
      {tab==="overview"&&<div style={{background:C.panel,border:`1px solid ${C.border}`}}>
        {checks.map((item,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"9px 14px",borderBottom:`1px solid ${C.border}`}}>
          <span style={{color:(item.v??0)===0?C.green:C.red,fontFamily:"monospace",fontSize:9,minWidth:36}}>{(item.v??0)===0?"PASS":"FAIL"}</span>
          <span style={{color:C.text,fontFamily:"monospace",fontSize:10,flex:1}}>{item.label}</span>
          <span style={{color:(item.v??0)===0?C.green:C.orange,fontFamily:"monospace",fontSize:11,fontWeight:700,minWidth:36,textAlign:"right"}}>{item.v??0}</span>
          {(item.v??0)>0&&<button onClick={()=>fix(item.label)} style={{background:"transparent",border:`1px solid ${C.lime}`,color:C.lime,fontFamily:"monospace",fontSize:8,padding:"2px 8px",cursor:"pointer"}}>FIX ▶</button>}
        </div>)}
      </div>}
      {tab==="pages"&&<div style={{background:C.panel,border:`1px solid ${C.border}`}}>
        <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
          <span style={{flex:1}}>URL</span><span style={{minWidth:55,textAlign:"right"}}>STATUS</span><span style={{minWidth:80,textAlign:"right"}}>LOAD</span><span style={{minWidth:60,textAlign:"right"}}>SIZE</span>
        </div>
        {results.pages.slice(0,25).map((p,i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
          <span style={{color:C.lime,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.url}</span>
          <span style={{color:p.status_code===200?C.green:C.red,minWidth:55,textAlign:"right"}}>{p.status_code}</span>
          <span style={{color:C.muted,minWidth:80,textAlign:"right"}}>{p.page_timing?.time_to_interactive?(p.page_timing.time_to_interactive/1000).toFixed(2)+"s":"—"}</span>
          <span style={{color:C.muted,minWidth:60,textAlign:"right"}}>{p.size?Math.round(p.size/1024)+"KB":"—"}</span>
        </div>)}
      </div>}
      {tab==="fixes"&&<div style={{background:"#060606",border:`1px solid ${C.border}`,padding:14,fontFamily:"monospace",fontSize:10}}>
        {fixLog.length===0&&!fixing&&<div style={{color:C.muted}}>Go to Overview → FIX ▶ any issue.</div>}
        {fixLog.map((l,i)=><div key={i} style={{marginBottom:5,whiteSpace:"pre-wrap",color:l.type==="sys"?C.lime:l.type==="ok"?C.text:l.type==="err"?C.red:C.muted}}>{l.msg}</div>)}
        {fixing&&<div style={{color:C.lime}}>█</div>}
      </div>}
    </>}
  </div>;
}

// ── KEYWORD INTEL ─────────────────────────────────────────────────
function Keywords({integrations}) {
  const ai=integrations.ai;const dfs=integrations.dataforseo?.fields;
  const [kw,setKw]=useState("");const [loc,setLoc]=useState("2840");const [running,setRunning]=useState(false);
  const [results,setResults]=useState(null);const [logs,setLogs]=useState([]);const [tab,setTab]=useState("overview");
  const [aiPlan,setAiPlan]=useState("");const [planning,setPlanning]=useState(false);
  const addLog=(msg,type="info")=>setLogs(p=>[...p,{msg,type,t:p.length*500}]);

  const run=async()=>{
    if(!kw)return;setRunning(true);setLogs([]);setResults(null);
    addLog("Querying DataForSEO Keywords API...","sys");
    try{
      const auth="Basic "+btoa(`${dfs.login}:${dfs.password}`);
      const [volRes,ideasRes]=await Promise.all([
        fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live",{method:"POST",headers:{"Content-Type":"application/json","Authorization":auth},body:JSON.stringify([{keywords:[kw,...kw.split(" ").slice(0,3)],location_code:parseInt(loc),language_code:"en"}])}),
        fetch("https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live",{method:"POST",headers:{"Content-Type":"application/json","Authorization":auth},body:JSON.stringify([{keyword:kw,location_code:parseInt(loc),language_code:"en",limit:30}])})
      ]);
      const [volData,ideasData]=await Promise.all([volRes.json(),ideasRes.json()]);
      addLog("Data received. Processing...","ok");
      setResults({volume:volData.tasks?.[0]?.result||[],ideas:ideasData.tasks?.[0]?.result?.[0]?.items||[]});
      addLog("KEYWORD ANALYSIS COMPLETE.","ok");
    }catch(e){addLog(`Error: ${e.message}`,"err");}
    setRunning(false);
  };

  const generatePlan=async()=>{
    setPlanning(true);setAiPlan("");
    const topKw=(results?.ideas||[]).slice(0,10).map(i=>`${i.keyword_data?.keyword} (vol:${i.keyword_data?.search_volume}, diff:${i.keyword_data?.keyword_difficulty})`).join(", ");
    try{const r=await callAI(ai,"You are Helio, an expert SEO strategist. Create a keyword cluster plan with content recommendations. Use [PILLAR], [CLUSTER], [INTENT] tags. Terminal style. Under 200 words.",`Seed keyword: "${kw}". Related keywords: ${topKw}. Build a content cluster plan.`);setAiPlan(r);}
    catch(e){setAiPlan(`Error: ${e.message}`);}
    setPlanning(false);
  };

  const diffColor=d=>d<=30?C.green:d<=60?C.orange:C.red;

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Keyword Intel" sub={`DataForSEO keyword research · AI clustering · ${ai?.fields?.model||"—"}`}/>
    <div style={{display:"flex",gap:10,marginBottom:18}}>
      <input value={kw} onChange={e=>setKw(e.target.value)} placeholder="Enter seed keyword (e.g. AI tools for business)"
        style={{flex:1,background:"#060606",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none"}}/>
      <select value={loc} onChange={e=>setLoc(e.target.value)} style={{background:"#060606",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none"}}>
        <option value="2840">United States</option><option value="2826">United Kingdom</option><option value="2036">Australia</option><option value="2356">India</option><option value="2124">Canada</option><option value="2586">Pakistan</option>
      </select>
      <Btn onClick={run} disabled={running||!kw}>{running?"▶ RESEARCHING...":"◉ RESEARCH"}</Btn>
    </div>
    {logs.length>0&&<div style={{marginBottom:18}}><TermLog lines={logs} running={running}/></div>}
    {results&&<>
      <Tabs tabs={["overview","ideas","ai plan"]} active={tab} onChange={setTab}/>
      {tab==="overview"&&<div>
        {results.volume.map((item,i)=><div key={i} style={{background:C.panel,border:`1px solid ${C.border}`,padding:16,marginBottom:10}}>
          <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
            {[{label:"Keyword",value:item.keyword,wide:true},{label:"Search Volume",value:item.search_volume?.toLocaleString()},{label:"CPC",value:item.cpc?`$${item.cpc.toFixed(2)}`:"—"},{label:"Competition",value:item.competition_level}].map((m,j)=><div key={j} style={{flex:m.wide?2:1,minWidth:80}}>
              <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,marginBottom:3}}>{m.label.toUpperCase()}</div>
              <div style={{color:C.lime,fontFamily:"monospace",fontSize:m.wide?13:16,fontWeight:700}}>{m.value??"—"}</div>
            </div>)}
          </div>
        </div>)}
      </div>}
      {tab==="ideas"&&<div style={{background:C.panel,border:`1px solid ${C.border}`}}>
        <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
          <span style={{flex:1}}>KEYWORD</span><span style={{minWidth:80,textAlign:"right"}}>VOLUME</span><span style={{minWidth:80,textAlign:"right"}}>DIFFICULTY</span><span style={{minWidth:70,textAlign:"right"}}>CPC</span>
        </div>
        {results.ideas.map((item,i)=>{const kd=item.keyword_data;return <div key={i} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
          <span style={{color:C.text,flex:1}}>{kd?.keyword}</span>
          <span style={{color:C.text,minWidth:80,textAlign:"right"}}>{kd?.search_volume?.toLocaleString()||"—"}</span>
          <span style={{color:diffColor(kd?.keyword_difficulty||0),minWidth:80,textAlign:"right"}}>{kd?.keyword_difficulty??"—"}/100</span>
          <span style={{color:C.muted,minWidth:70,textAlign:"right"}}>{kd?.cpc?`$${kd.cpc.toFixed(2)}`:"—"}</span>
        </div>;})}
      </div>}
      {tab==="ai plan"&&<div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2}}>◈ AI KEYWORD CLUSTER PLAN</div>
          <Btn onClick={generatePlan} disabled={planning}>{planning?"PLANNING...":"GENERATE CLUSTER PLAN"}</Btn>
        </div>
        <div style={{background:"#060606",border:`1px solid ${C.borderLime}`,padding:16,fontFamily:"monospace",fontSize:11,minHeight:120}}>
          {planning&&<div style={{color:C.lime}}>Helio is building your cluster plan █</div>}
          {aiPlan&&<div style={{color:C.text,whiteSpace:"pre-wrap",lineHeight:1.7}}>{aiPlan}</div>}
          {!aiPlan&&!planning&&<div style={{color:C.muted}}>Click GENERATE CLUSTER PLAN to get AI-powered keyword groupings and content recommendations.</div>}
        </div>
      </div>}
    </>}
  </div>;
}

// ── CONTENT ENGINE ────────────────────────────────────────────────
function Content({integrations}) {
  const ai=integrations.ai;
  const [topic,setTopic]=useState("");const [kws,setKws]=useState("");const [type,setType]=useState("blog");
  const [generating,setGenerating]=useState(false);const [article,setArticle]=useState("");
  const [tab,setTab]=useState("generate");const [calendar,setCalendar]=useState([]);const [calLoading,setCalLoading]=useState(false);

  const generate=async()=>{
    if(!topic)return;setGenerating(true);setArticle("");setTab("output");
    try{const r=await callAI(ai,`You are Helio, an expert SEO content writer. Write a full EEAT-optimized ${type==="blog"?"blog post":"pillar page"} with: H1, intro, 5+ H2 sections with H3 subsections, conclusion, meta title and description. Include internal linking placeholders [LINK: topic]. Word count: 800-1200. Format clearly.`,`Topic: "${topic}". Target keywords: ${kws||topic}. Type: ${type}.`);setArticle(r);}
    catch(e){setArticle(`Error: ${e.message}`);}
    setGenerating(false);
  };

  const genCalendar=async()=>{
    setCalLoading(true);setCalendar([]);setTab("calendar");
    try{const r=await callAI(ai,"You are Helio SEO agent. Generate a 3-month content calendar. Return ONLY valid JSON array: [{month,week,title,type,targetKw,intent,status}]. No markdown, no explanation, raw JSON only.","Generate a 12-post 3-month SEO content calendar for an AI tools and automation platform targeting solopreneurs.");
      try{const parsed=JSON.parse(r.replace(/```json?|```/g,"").trim());setCalendar(parsed);}
      catch{setCalendar([{month:"Jan",week:1,title:r.slice(0,80),type:"Blog",targetKw:"ai tools",intent:"Informational",status:"Planned"}]);}
    }catch(e){console.error(e);}
    setCalLoading(false);
  };

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Content Engine" sub={`EEAT-optimized content generation · AI: ${ai?.fields?.model||"—"}`}/>
    <Tabs tabs={["generate","output","calendar"]} active={tab} onChange={setTab}/>
    {tab==="generate"&&<div style={{display:"flex",flexDirection:"column",gap:14}}>
      <Input label="Article Topic" value={topic} onChange={setTopic} placeholder="e.g. How to use AI for social media automation"/>
      <Input label="Target Keywords (comma-separated)" value={kws} onChange={setKws} placeholder="ai social media, automation tools, solopreneur"/>
      <div>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:5}}>CONTENT TYPE</div>
        <div style={{display:"flex",gap:0}}>
          {["blog","pillar","listicle"].map(t=><div key={t} onClick={()=>setType(t)} style={{flex:1,padding:"8px 0",textAlign:"center",cursor:"pointer",fontFamily:"monospace",fontSize:10,fontWeight:700,background:type===t?C.lime:"#060606",color:type===t?"#000":C.muted,border:`1px solid ${type===t?C.lime:C.dim}`,marginRight:-1}}>{t.toUpperCase()}</div>)}
        </div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <Btn onClick={generate} disabled={generating||!topic}>{generating?"▶ GENERATING...":"▣ GENERATE ARTICLE"}</Btn>
        <Btn onClick={genCalendar} disabled={calLoading} variant="blue">{calLoading?"PLANNING...":"◉ BUILD CONTENT CALENDAR"}</Btn>
      </div>
    </div>}
    {tab==="output"&&<div>
      {generating&&<div style={{color:C.lime,fontFamily:"monospace",fontSize:11,padding:20}}>Helio is writing your {type} article █</div>}
      {article&&<div style={{background:"#060606",border:`1px solid ${C.border}`,padding:20,fontFamily:"monospace",fontSize:11,whiteSpace:"pre-wrap",lineHeight:1.8,color:C.text,maxHeight:600,overflowY:"auto",scrollbarWidth:"thin"}}>{article}</div>}
      {article&&<div style={{marginTop:12,display:"flex",gap:10}}>
        <Btn onClick={()=>navigator.clipboard.writeText(article)}>COPY ARTICLE</Btn>
        <Btn onClick={()=>{const b=new Blob([article],{type:"text/plain"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download="helio-article.txt";a.click();}} variant="blue">DOWNLOAD .TXT</Btn>
      </div>}
    </div>}
    {tab==="calendar"&&<div>
      {calLoading&&<div style={{color:C.lime,fontFamily:"monospace",fontSize:11,padding:20}}>Building content calendar █</div>}
      {calendar.length>0&&<div style={{background:C.panel,border:`1px solid ${C.border}`}}>
        <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
          <span style={{minWidth:50}}>MONTH</span><span style={{minWidth:40}}>WK</span><span style={{flex:1}}>TITLE</span><span style={{minWidth:80}}>TYPE</span><span style={{minWidth:90}}>INTENT</span><span style={{minWidth:70}}>STATUS</span>
        </div>
        {calendar.map((row,i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10,alignItems:"center"}}>
          <span style={{color:C.lime,minWidth:50}}>{row.month}</span><span style={{color:C.muted,minWidth:40}}>W{row.week}</span>
          <span style={{color:C.text,flex:1}}>{row.title}</span>
          <span style={{color:C.blue,minWidth:80}}>{row.type}</span>
          <span style={{color:C.muted,minWidth:90}}>{row.intent}</span>
          <span style={{color:row.status==="Published"?C.green:row.status==="Draft"?C.orange:C.muted,minWidth:70}}>{row.status}</span>
        </div>)}
      </div>}
      {!calLoading&&calendar.length===0&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:11,padding:20}}>Go to Generate tab → click BUILD CONTENT CALENDAR</div>}
    </div>}
  </div>;
}

// ── ON-PAGE SEO ───────────────────────────────────────────────────
function OnPage({integrations}) {
  const ai=integrations.ai;const dfs=integrations.dataforseo?.fields;
  const [url,setUrl]=useState("");const [running,setRunning]=useState(false);
  const [data,setData]=useState(null);const [logs,setLogs]=useState([]);const [suggestions,setSuggestions]=useState("");const [suggesting,setSuggesting]=useState(false);
  const addLog=(msg,type="info")=>setLogs(p=>[...p,{msg,type,t:p.length*500}]);

  const analyze=async()=>{
    if(!url)return;setRunning(true);setLogs([]);setData(null);
    addLog("Fetching on-page data via DataForSEO...","sys");
    try{
      const auth="Basic "+btoa(`${dfs.login}:${dfs.password}`);
      const res=await fetch("https://api.dataforseo.com/v3/on_page/instant_pages",{method:"POST",headers:{"Content-Type":"application/json","Authorization":auth},body:JSON.stringify([{url,enable_javascript:false,enable_browser_rendering:false}])});
      const d=await res.json();
      const item=d.tasks?.[0]?.result?.[0]?.items?.[0];
      if(item){setData(item);addLog("On-page analysis complete.","ok");}
      else addLog(`Error: ${d.tasks?.[0]?.status_message||"No data returned"}`,"err");
    }catch(e){addLog(`Error: ${e.message}`,"err");}
    setRunning(false);
  };

  const getSuggestions=async()=>{
    if(!data)return;setSuggesting(true);setSuggestions("");
    const ctx=`URL: ${data.url}, Title: ${data.meta?.title}, Description: ${data.meta?.description}, H1: ${data.meta?.htags?.h1?.[0]}, Word count: ${data.meta?.content?.words_count}, Load time: ${data.page_timing?.time_to_interactive}ms`;
    try{const r=await callAI(ai,"You are Helio, expert SEO analyst. Give 5 specific on-page optimization recommendations. Use [H1], [META], [CONTENT], [SPEED], [SCHEMA] tags. Terminal style, precise, actionable.",`Analyze and optimize: ${ctx}`);setSuggestions(r);}
    catch(e){setSuggestions(`Error: ${e.message}`);}
    setSuggesting(false);
  };

  const row=(label,value,good)=><div style={{display:"flex",gap:12,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10,alignItems:"flex-start"}}>
    <span style={{color:C.muted,minWidth:160,flexShrink:0}}>{label}</span>
    <span style={{color:good===undefined?C.text:good?C.green:C.orange,flex:1,wordBreak:"break-all"}}>{value??"—"}</span>
    {good!==undefined&&<span style={{color:good?C.green:C.red,minWidth:36,textAlign:"right"}}>{good?"✓":"⚠"}</span>}
  </div>;

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="On-Page SEO" sub={`Page-level analysis · DataForSEO instant pages · AI: ${ai?.fields?.model||"—"}`}/>
    <div style={{display:"flex",gap:10,marginBottom:18}}>
      <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="Full URL to analyze (e.g. https://generalizingai.com/blog/ai-tools)"
        style={{flex:1,background:"#060606",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none"}}/>
      <Btn onClick={analyze} disabled={running||!url}>{running?"▶ ANALYZING...":"◧ ANALYZE PAGE"}</Btn>
    </div>
    {logs.length>0&&<div style={{marginBottom:18}}><TermLog lines={logs} running={running}/></div>}
    {data&&<>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>
        {[{label:"Status",value:data.status_code,delta:data.status_code===200?"✓ OK":"⚠ Error",good:data.status_code===200},{label:"Word Count",value:data.meta?.content?.words_count},{label:"Load Time",value:data.page_timing?.time_to_interactive?`${(data.page_timing.time_to_interactive/1000).toFixed(2)}s`:"—",delta:data.page_timing?.time_to_interactive<2500?"✓ Fast":"⚠ Slow",good:data.page_timing?.time_to_interactive<2500},{label:"Page Size",value:data.size?`${Math.round(data.size/1024)}KB`:"—"}].map((m,i)=><Card key={i} {...m}/>)}
      </div>
      <div style={{background:C.panel,border:`1px solid ${C.border}`,marginBottom:18}}>
        {row("Title Tag",data.meta?.title,(data.meta?.title?.length||0)>10&&(data.meta?.title?.length||0)<70)}
        {row("Meta Description",data.meta?.description,(data.meta?.description?.length||0)>50&&(data.meta?.description?.length||0)<160)}
        {row("H1 Tag",data.meta?.htags?.h1?.[0],!!data.meta?.htags?.h1?.[0])}
        {row("Canonical",data.meta?.canonical,!!data.meta?.canonical)}
        {row("Images w/o Alt",data.checks?.no_image_alt?(data.checks.no_image_alt+" images missing alt"):null,(data.checks?.no_image_alt||0)===0)}
        {row("Internal Links",data.internal_links_count)}
        {row("External Links",data.external_links_count)}
        {row("Schema Markup",data.meta?.structured_data?JSON.stringify(Object.keys(data.meta.structured_data)).slice(0,60):null,!!data.meta?.structured_data)}
      </div>
      <div style={{background:"#060606",border:`1px solid ${C.borderLime}`,padding:16,marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2}}>◈ AI OPTIMIZATION RECOMMENDATIONS</div>
          <Btn onClick={getSuggestions} disabled={suggesting}>{suggesting?"ANALYZING...":"GET AI SUGGESTIONS"}</Btn>
        </div>
        {suggesting&&<div style={{color:C.lime,fontFamily:"monospace",fontSize:11}}>Analyzing page █</div>}
        {suggestions&&<div style={{color:C.text,fontFamily:"monospace",fontSize:11,whiteSpace:"pre-wrap",lineHeight:1.7}}>{suggestions}</div>}
        {!suggestions&&!suggesting&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:11}}>Click GET AI SUGGESTIONS for specific optimization recommendations.</div>}
      </div>
    </>}
  </div>;
}

// ── BACKLINK MANAGER ──────────────────────────────────────────────
function Backlinks({integrations}) {
  const ai=integrations.ai;const dfs=integrations.dataforseo?.fields;
  const [domain,setDomain]=useState("");const [running,setRunning]=useState(false);
  const [data,setData]=useState(null);const [logs,setLogs]=useState([]);const [tab,setTab]=useState("overview");
  const [outreach,setOutreach]=useState("");const [generatingOutreach,setGeneratingOutreach]=useState(false);
  const addLog=(msg,type="info")=>setLogs(p=>[...p,{msg,type,t:p.length*500}]);

  const run=async()=>{
    if(!domain)return;setRunning(true);setLogs([]);setData(null);
    addLog("Fetching backlink data from DataForSEO...","sys");
    try{
      const auth="Basic "+btoa(`${dfs.login}:${dfs.password}`);
      const [sumRes,blRes]=await Promise.all([
        fetch("https://api.dataforseo.com/v3/backlinks/summary/live",{method:"POST",headers:{"Content-Type":"application/json","Authorization":auth},body:JSON.stringify([{target:domain,include_subdomains:true}])}),
        fetch("https://api.dataforseo.com/v3/backlinks/backlinks/live",{method:"POST",headers:{"Content-Type":"application/json","Authorization":auth},body:JSON.stringify([{target:domain,limit:20,mode:"as_is"}])})
      ]);
      const [sumData,blData]=await Promise.all([sumRes.json(),blRes.json()]);
      addLog("Backlink data loaded.","ok");
      setData({summary:sumData.tasks?.[0]?.result?.[0],backlinks:blData.tasks?.[0]?.result?.[0]?.items||[]});
    }catch(e){addLog(`Error: ${e.message}`,"err");}
    setRunning(false);
  };

  const genOutreach=async()=>{
    setGeneratingOutreach(true);setOutreach("");
    try{const r=await callAI(ai,"You are Helio, an expert SEO link builder. Write a concise, personalized guest post outreach email. Professional but conversational tone. Under 150 words. Include subject line.",`Write a guest post outreach email for a site about AI tools and automation. Domain: ${domain}`);setOutreach(r);}
    catch(e){setOutreach(`Error: ${e.message}`);}
    setGeneratingOutreach(false);
  };

  const s=data?.summary;
  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Backlink Manager" sub={`DataForSEO backlink analysis · DoFollow/NoFollow tracking · AI outreach`}/>
    <div style={{display:"flex",gap:10,marginBottom:18}}>
      <input value={domain} onChange={e=>setDomain(e.target.value)} placeholder="Domain to analyze (e.g. generalizingai.com)"
        style={{flex:1,background:"#060606",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none"}}/>
      <Btn onClick={run} disabled={running||!domain}>{running?"▶ LOADING...":"⬢ ANALYZE BACKLINKS"}</Btn>
    </div>
    {logs.length>0&&<div style={{marginBottom:18}}><TermLog lines={logs} running={running}/></div>}
    {data&&<>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>
        {[{label:"Domain Rank",value:s?.rank},{label:"Backlinks",value:s?.backlinks?.toLocaleString()},{label:"Ref Domains",value:s?.referring_domains?.toLocaleString()},{label:"DoFollow",value:s?.backlinks_dofollow?.toLocaleString()},{label:"NoFollow",value:s?.backlinks_nofollow?.toLocaleString()},{label:"Broken",value:s?.broken_backlinks}].map((m,i)=><Card key={i} {...m}/>)}
      </div>
      <Tabs tabs={["overview","backlinks","outreach"]} active={tab} onChange={setTab}/>
      {tab==="overview"&&<div style={{background:C.panel,border:`1px solid ${C.border}`}}>
        {[{label:"Referring IPs",value:s?.referring_ips},{label:"Referring Subnets",value:s?.referring_subnets},{label:"Spam Score",value:s?.spam_score},{label:"Follow",value:s?.backlinks_follow},{label:"UGC Links",value:s?.backlinks_ugc},{label:"Sponsored",value:s?.backlinks_sponsored}].map((item,i)=><div key={i} style={{display:"flex",gap:12,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
          <span style={{color:C.muted,minWidth:160}}>{item.label}</span><span style={{color:C.lime}}>{item.value?.toLocaleString()??"—"}</span>
        </div>)}
      </div>}
      {tab==="backlinks"&&<div style={{background:C.panel,border:`1px solid ${C.border}`}}>
        <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
          <span style={{flex:1}}>SOURCE URL</span><span style={{minWidth:40}}>DA</span><span style={{minWidth:70}}>TYPE</span><span style={{minWidth:60}}>ANCHOR</span>
        </div>
        {data.backlinks.map((bl,i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10,alignItems:"center"}}>
          <span style={{color:C.blue,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{bl.url_from}</span>
          <span style={{color:C.lime,minWidth:40}}>{bl.page_from_rank??"-"}</span>
          <span style={{color:bl.dofollow?C.green:C.muted,minWidth:70}}>{bl.dofollow?"DoFollow":"NoFollow"}</span>
          <span style={{color:C.muted,minWidth:60,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{bl.anchor||"—"}</span>
        </div>)}
      </div>}
      {tab==="outreach"&&<div>
        <Btn onClick={genOutreach} disabled={generatingOutreach} style={{marginBottom:14}}>{generatingOutreach?"WRITING...":"✉ GENERATE OUTREACH EMAIL"}</Btn>
        <div style={{background:"#060606",border:`1px solid ${C.border}`,padding:16,fontFamily:"monospace",fontSize:11,minHeight:120}}>
          {outreach&&<div style={{color:C.text,whiteSpace:"pre-wrap",lineHeight:1.7}}>{outreach}</div>}
          {!outreach&&!generatingOutreach&&<div style={{color:C.muted}}>Click to generate a personalized guest post outreach email.</div>}
        </div>
      </div>}
    </>}
  </div>;
}

// ── SEARCH CONSOLE ────────────────────────────────────────────────
function GSC({integrations}) {
  const ai=integrations.ai;const gscF=integrations.gsc?.fields;
  const [loading,setLoading]=useState(false);const [logs,setLogs]=useState([]);const [data,setData]=useState(null);
  const [tab,setTab]=useState("pages");const [insight,setInsight]=useState("");const [insightLoading,setInsightLoading]=useState(false);const [days,setDays]=useState(28);
  const addLog=(msg,type="info")=>setLogs(p=>[...p,{msg,type,t:p.length*500}]);
  const end=new Date().toISOString().split("T")[0];const start=new Date(Date.now()-days*86400000).toISOString().split("T")[0];

  const load=async()=>{
    setLoading(true);setLogs([]);setData(null);addLog("Connecting to GSC API...","sys");
    try{
      const h={"Content-Type":"application/json","Authorization":`Bearer ${gscF.accessToken}`};
      const site=encodeURIComponent(gscF.siteUrl||"");const base=`https://www.googleapis.com/webmasters/v3/sites/${site}`;
      const [pRes,kRes,tRes]=await Promise.all([
        fetch(`${base}/searchAnalytics/query`,{method:"POST",headers:h,body:JSON.stringify({startDate:start,endDate:end,dimensions:["page"],rowLimit:20})}),
        fetch(`${base}/searchAnalytics/query`,{method:"POST",headers:h,body:JSON.stringify({startDate:start,endDate:end,dimensions:["query"],rowLimit:20})}),
        fetch(`${base}/searchAnalytics/query`,{method:"POST",headers:h,body:JSON.stringify({startDate:start,endDate:end,dimensions:[],rowLimit:1})}),
      ]);
      const [pD,kD,tD]=await Promise.all([pRes.json(),kRes.json(),tRes.json()]);
      if(!pRes.ok){addLog(`Error: ${pD.error?.message}`,"err");setLoading(false);return;}
      addLog("GSC data loaded.","ok");setData({pages:pD.rows||[],keywords:kD.rows||[],totals:tD.rows?.[0]||{}});
    }catch(e){addLog(`Error: ${e.message}`,"err");}
    setLoading(false);
  };

  const analyze=async()=>{
    setInsightLoading(true);setInsight("");
    const ctx=`Pages: ${data?.pages?.slice(0,5).map(r=>`${r.keys[0]}(${r.clicks}clicks,pos${r.position?.toFixed(1)})`).join(",")}. KWs: ${data?.keywords?.slice(0,5).map(r=>`"${r.keys[0]}"pos${r.position?.toFixed(1)},CTR${(r.ctr*100).toFixed(1)}%`).join(",")}. Total clicks:${data?.totals?.clicks},CTR:${(data?.totals?.ctr*100)?.toFixed(2)}%,pos:${data?.totals?.position?.toFixed(1)}`;
    try{const r=await callAI(ai,"You are Helio SEO agent. Return exactly 3 priority actions [ACTION 1],[ACTION 2],[ACTION 3]. Name specific pages/keywords. Under 160 words. Terminal style.",`Analyze GSC data: ${ctx}`);setInsight(r);}
    catch(e){setInsight(`Error: ${e.message}`);}
    setInsightLoading(false);
  };

  const pc=p=>p<=5?C.green:p<=10?C.orange:C.red;
  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Search Console" sub={`Real GSC data · AI: ${ai?.fields?.model||"—"}`}/>
    <div style={{display:"flex",gap:10,marginBottom:18,alignItems:"center"}}>
      <select value={days} onChange={e=>setDays(+e.target.value)} style={{background:"#060606",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none"}}>
        <option value={7}>Last 7 days</option><option value={28}>Last 28 days</option><option value={90}>Last 90 days</option>
      </select>
      <Btn onClick={load} disabled={loading}>{loading?"▶ LOADING...":"◈ LOAD GSC DATA"}</Btn>
      <span style={{color:C.muted,fontFamily:"monospace",fontSize:10}}>{gscF?.siteUrl}</span>
    </div>
    {logs.length>0&&<div style={{marginBottom:18}}><TermLog lines={logs} running={loading}/></div>}
    {data&&<>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>
        {[{label:"Total Clicks",value:data.totals?.clicks?.toLocaleString()},{label:"Impressions",value:data.totals?.impressions?.toLocaleString()},{label:"Avg CTR",value:data.totals?.ctr?(data.totals.ctr*100).toFixed(2)+"%":"—"},{label:"Avg Position",value:data.totals?.position?.toFixed(1)}].map((m,i)=><Card key={i} {...m}/>)}
      </div>
      <div style={{background:"#060606",border:`1px solid ${C.borderLime}`,padding:16,marginBottom:18}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{color:C.lime,fontFamily:"monospace",fontSize:10,letterSpacing:2}}>◈ HELIO AI INSIGHT</div>
          <Btn onClick={analyze} disabled={insightLoading}>{insightLoading?"ANALYZING...":"ANALYZE ▶"}</Btn>
        </div>
        {insightLoading&&<div style={{color:C.lime,fontFamily:"monospace",fontSize:11}}>Analyzing █</div>}
        {insight&&<div style={{color:C.text,fontFamily:"monospace",fontSize:11,whiteSpace:"pre-wrap",lineHeight:1.7}}>{insight}</div>}
        {!insight&&!insightLoading&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:11}}>Click ANALYZE to get priority actions from your live GSC data.</div>}
      </div>
      <Tabs tabs={["pages","keywords"]} active={tab} onChange={setTab}/>
      <div style={{background:C.panel,border:`1px solid ${C.border}`}}>
        <div style={{display:"flex",gap:10,padding:"7px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:9,color:C.muted}}>
          <span style={{flex:1}}>{tab==="pages"?"PAGE":"KEYWORD"}</span><span style={{minWidth:60,textAlign:"right"}}>CLICKS</span><span style={{minWidth:80,textAlign:"right"}}>IMPRESSIONS</span><span style={{minWidth:55,textAlign:"right"}}>CTR</span><span style={{minWidth:60,textAlign:"right"}}>POSITION</span>
        </div>
        {(tab==="pages"?data.pages:data.keywords).map((r,i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
          <span style={{color:tab==="pages"?C.lime:C.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={r.keys[0]}>{r.keys[0]}</span>
          <span style={{color:C.text,minWidth:60,textAlign:"right"}}>{r.clicks.toLocaleString()}</span>
          <span style={{color:C.text,minWidth:80,textAlign:"right"}}>{r.impressions.toLocaleString()}</span>
          <span style={{color:C.green,minWidth:55,textAlign:"right"}}>{(r.ctr*100).toFixed(1)}%</span>
          <span style={{color:pc(r.position),minWidth:60,textAlign:"right"}}>{r.position?.toFixed(1)}</span>
        </div>)}
      </div>
    </>}
  </div>;
}

// ── ANALYTICS ─────────────────────────────────────────────────────
function Analytics({integrations}) {
  const ai=integrations.ai;const ga4F=integrations.ga4?.fields;
  const [loading,setLoading]=useState(false);const [logs,setLogs]=useState([]);const [data,setData]=useState(null);const [days,setDays]=useState(28);
  const addLog=(msg,type="info")=>setLogs(p=>[...p,{msg,type,t:p.length*500}]);

  const load=async()=>{
    setLoading(true);setLogs([]);setData(null);addLog("Connecting to GA4 API...","sys");
    try{
      const propId=ga4F?.extra?.propertyId;
      const h={"Content-Type":"application/json","Authorization":`Bearer ${ga4F.accessToken}`};
      const body={dateRanges:[{startDate:`${days}daysAgo`,endDate:"today"}],dimensions:[{name:"sessionDefaultChannelGroup"}],metrics:[{name:"sessions"},{name:"activeUsers"},{name:"newUsers"},{name:"bounceRate"},{name:"averageSessionDuration"},{name:"screenPageViews"}]};
      const [mainRes,pageRes]=await Promise.all([
        fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runReport`,{method:"POST",headers:h,body:JSON.stringify(body)}),
        fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runReport`,{method:"POST",headers:h,body:JSON.stringify({dateRanges:[{startDate:`${days}daysAgo`,endDate:"today"}],dimensions:[{name:"pagePath"}],metrics:[{name:"screenPageViews"},{name:"averageSessionDuration"},{name:"bounceRate"}],orderBys:[{metric:{metricName:"screenPageViews"},desc:true}],limit:20})}),
      ]);
      const [mainD,pageD]=await Promise.all([mainRes.json(),pageRes.json()]);
      if(!mainRes.ok){addLog(`Error: ${mainD.error?.message}`,"err");setLoading(false);return;}
      addLog("GA4 data loaded.","ok");setData({channels:mainD.rows||[],pages:pageD.rows||[],hdrs:{main:mainD.dimensionHeaders,pages:pageD.dimensionHeaders}});
    }catch(e){addLog(`Error: ${e.message}`,"err");}
    setLoading(false);
  };

  const totals=data?.channels?.reduce((acc,r)=>({sessions:acc.sessions+(+r.metricValues[0].value||0),users:acc.users+(+r.metricValues[1].value||0),pageviews:acc.pageviews+(+r.metricValues[5].value||0)}),{sessions:0,users:0,pageviews:0});

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Analytics" sub={`Real GA4 data · Traffic, sessions, channels · AI: ${ai?.fields?.model||"—"}`}/>
    <div style={{display:"flex",gap:10,marginBottom:18}}>
      <select value={days} onChange={e=>setDays(+e.target.value)} style={{background:"#060606",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none"}}>
        <option value={7}>Last 7 days</option><option value={28}>Last 28 days</option><option value={90}>Last 90 days</option>
      </select>
      <Btn onClick={load} disabled={loading}>{loading?"▶ LOADING...":"▦ LOAD GA4 DATA"}</Btn>
    </div>
    {logs.length>0&&<div style={{marginBottom:18}}><TermLog lines={logs} running={loading}/></div>}
    {data&&<>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:18}}>
        {[{label:"Total Sessions",value:totals.sessions?.toLocaleString()},{label:"Active Users",value:totals.users?.toLocaleString()},{label:"Page Views",value:totals.pageviews?.toLocaleString()}].map((m,i)=><Card key={i} {...m}/>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <div>
          <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,letterSpacing:2,marginBottom:8}}>TRAFFIC BY CHANNEL</div>
          <div style={{background:C.panel,border:`1px solid ${C.border}`}}>
            {data.channels.map((r,i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
              <span style={{color:C.text,flex:1}}>{r.dimensionValues[0].value}</span>
              <span style={{color:C.lime,minWidth:60,textAlign:"right"}}>{(+r.metricValues[0].value).toLocaleString()}</span>
              <span style={{color:C.muted,minWidth:50,textAlign:"right"}}>sessions</span>
            </div>)}
          </div>
        </div>
        <div>
          <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,letterSpacing:2,marginBottom:8}}>TOP PAGES</div>
          <div style={{background:C.panel,border:`1px solid ${C.border}`}}>
            {data.pages.slice(0,10).map((r,i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
              <span style={{color:C.lime,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.dimensionValues[0].value}</span>
              <span style={{color:C.text,minWidth:50,textAlign:"right"}}>{(+r.metricValues[0].value).toLocaleString()}</span>
            </div>)}
          </div>
        </div>
      </div>
    </>}
  </div>;
}

// ── AEO / GEO ─────────────────────────────────────────────────────
function AEO({integrations}) {
  const ai=integrations.ai;
  const [url,setUrl]=useState("");const [topic,setTopic]=useState("");const [running,setRunning]=useState(false);
  const [output,setOutput]=useState("");const [tab,setTab]=useState("aeo");

  const run=async(type)=>{
    setRunning(true);setOutput("");
    const prompts={
      aeo:`You are Helio, an AEO (Answer Engine Optimization) expert. Analyze this topic and generate: 1) A direct answer block optimized for AI search engines (Perplexity, SearchGPT, Gemini). 2) 5 FAQ pairs in Q&A format optimized for featured snippets. 3) Schema markup JSON-LD for FAQPage. Topic: ${topic||url}`,
      geo:`You are Helio, a GEO (Generative Engine Optimization) expert. Create content optimized to appear in LLM responses (ChatGPT, Claude, Gemini). Include: 1) A definitive answer statement LLMs will quote. 2) Key facts with statistics. 3) How to structure content for LLM visibility. 4) Recommended entity relationships to build. Topic: ${topic||url}`,
      llm:`You are Helio, an LLM visibility expert. Generate a complete brand mention strategy: 1) Key brand claims LLMs should associate with this entity. 2) Recommended Wikipedia-style entity description. 3) Top 5 authoritative sites to get brand mentions on. 4) Content topics that will surface in LLM responses. Brand/Topic: ${topic||url}`,
    };
    try{const r=await callAI(ai,"You are Helio, the world's most advanced SEO/AEO/GEO agent. Respond with precise, actionable, structured output. Use headers and numbered lists.",prompts[type]);setOutput(r);}
    catch(e){setOutput(`Error: ${e.message}`);}
    setRunning(false);
  };

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="AEO / GEO" sub="Answer Engine Optimization · Generative Engine Optimization · LLM Visibility"/>
    <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:18}}>
      <Input label="Topic or URL to Optimize" value={topic} onChange={setTopic} placeholder="e.g. AI automation tools for solopreneurs"/>
      <div style={{background:"#0d1117",border:`1px solid ${C.dim}`,padding:14,fontFamily:"monospace",fontSize:10,color:C.muted,lineHeight:1.8}}>
        <div style={{color:C.lime,marginBottom:6}}>WHAT HELIO WILL DO</div>
        <span style={{color:C.text}}>AEO:</span> Optimize for AI search engines (Perplexity, SearchGPT, Gemini AI Overviews) — featured snippets, FAQ schema, direct answer blocks<br/>
        <span style={{color:C.text}}>GEO:</span> Optimize for LLM training and retrieval — structure content so ChatGPT, Claude, Gemini cite your brand<br/>
        <span style={{color:C.text}}>LLM Visibility:</span> Brand mention strategy, entity building, Wikipedia optimization
      </div>
    </div>
    <Tabs tabs={["aeo","geo","llm visibility"]} active={tab} onChange={setTab}/>
    <div style={{display:"flex",gap:10,marginBottom:18}}>
      <Btn onClick={()=>run(tab==="llm visibility"?"llm":tab)} disabled={running||!topic}>{running?"▶ OPTIMIZING...":tab==="aeo"?"◬ RUN AEO OPTIMIZATION":tab==="geo"?"◬ RUN GEO OPTIMIZATION":"◬ BUILD LLM VISIBILITY STRATEGY"}</Btn>
    </div>
    <div style={{background:"#060606",border:`1px solid ${C.borderLime}`,padding:16,minHeight:200,fontFamily:"monospace",fontSize:11}}>
      {running&&<div style={{color:C.lime}}>Helio is optimizing for {tab.toUpperCase()} █</div>}
      {output&&<div style={{color:C.text,whiteSpace:"pre-wrap",lineHeight:1.8}}>{output}</div>}
      {!output&&!running&&<div style={{color:C.muted}}>Select a tab and enter your topic to start AEO/GEO optimization.</div>}
    </div>
  </div>;
}

// ── GITHUB OPS ────────────────────────────────────────────────────
function GitHub({integrations}) {
  const ai=integrations.ai;const ghF=integrations.github?.fields;
  const [logs,setLogs]=useState([]);const [prs,setPrs]=useState([]);const [commits,setCommits]=useState([]);
  const [loading,setLoading]=useState(false);const [fix,setFix]=useState("");const [fixCode,setFixCode]=useState("");const [generatingFix,setGeneratingFix]=useState(false);const [tab,setTab]=useState("overview");
  const addLog=(msg,type="info")=>setLogs(p=>[...p,{msg,type,t:p.length*400}]);

  const load=async()=>{
    setLoading(true);setLogs([]);addLog("Connecting to GitHub API...","sys");
    try{
      const h={"Authorization":`token ${ghF.token}`,"Accept":"application/vnd.github.v3+json"};
      const [prRes,cRes]=await Promise.all([
        fetch(`https://api.github.com/repos/${ghF.repo}/pulls?state=open&per_page=10`,{headers:h}),
        fetch(`https://api.github.com/repos/${ghF.repo}/commits?per_page=15`,{headers:h}),
      ]);
      const [prD,cD]=await Promise.all([prRes.json(),cRes.json()]);
      if(!prRes.ok){addLog(`Error: ${prD.message}`,"err");setLoading(false);return;}
      setPrs(prD);setCommits(cD);addLog(`Loaded ${prD.length} open PRs, ${cD.length} recent commits.`,"ok");
    }catch(e){addLog(`Error: ${e.message}`,"err");}
    setLoading(false);
  };

  const generateFix=async()=>{
    if(!fix)return;setGeneratingFix(true);setFixCode("");
    try{const r=await callAI(ai,"You are Helio, an expert SEO engineer. Generate the exact code fix needed. Include filename, the code block, and a git commit message. Format: FILENAME:\n```\nCODE\n```\nCOMMIT MESSAGE: ...",`Generate code fix for SEO issue: ${fix}. Repository: ${ghF.repo}`);setFixCode(r);setTab("fix");}
    catch(e){setFixCode(`Error: ${e.message}`);}
    setGeneratingFix(false);
  };

  const createPR=async()=>{
    addLog("Creating PR via GitHub API...","sys");
    try{
      const h={"Authorization":`token ${ghF.token}`,"Accept":"application/vnd.github.v3+json","Content-Type":"application/json"};
      const branchRes=await fetch(`https://api.github.com/repos/${ghF.repo}/git/refs/heads/main`,{headers:h});
      const branchD=await branchRes.json();
      const sha=branchD.object?.sha;
      if(!sha){addLog("Could not get branch SHA.","err");return;}
      const branch=`helio-seo-fix-${Date.now()}`;
      await fetch(`https://api.github.com/repos/${ghF.repo}/git/refs`,{method:"POST",headers:h,body:JSON.stringify({ref:`refs/heads/${branch}`,sha})});
      addLog(`Branch created: ${branch}`,"ok");
      const prRes=await fetch(`https://api.github.com/repos/${ghF.repo}/pulls`,{method:"POST",headers:h,body:JSON.stringify({title:`[Helio SEO] ${fix.slice(0,60)}`,body:`Auto-generated by Helio SEO Agent.\n\n${fixCode}`,head:branch,base:"main"})});
      const prD=await prRes.json();
      if(prD.html_url){addLog(`✓ PR created: ${prD.html_url}`,"ok");}
      else addLog(`PR failed: ${prD.message}`,"err");
    }catch(e){addLog(`Error: ${e.message}`,"err");}
  };

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="GitHub Ops" sub={`Code deployments · SEO fix automation · Repo: ${ghF?.repo||"—"}`}/>
    <div style={{display:"flex",gap:10,marginBottom:18}}>
      <Btn onClick={load} disabled={loading}>{loading?"▶ LOADING...":"⬡ LOAD REPO DATA"}</Btn>
    </div>
    {logs.length>0&&<div style={{marginBottom:18}}><TermLog lines={logs} running={loading}/></div>}
    <Tabs tabs={["overview","commits","fix"]} active={tab} onChange={setTab}/>
    {tab==="overview"&&<div>
      <div style={{display:"flex",gap:10,marginBottom:18}}>
        <Input label="SEO Issue to Fix" value={fix} onChange={setFix} placeholder="e.g. Add canonical tags to all blog pages"/>
        <div style={{alignSelf:"flex-end"}}><Btn onClick={generateFix} disabled={generatingFix||!fix}>{generatingFix?"GENERATING...":"⬡ GENERATE FIX"}</Btn></div>
      </div>
      {prs.length>0&&<div style={{background:C.panel,border:`1px solid ${C.border}`,marginBottom:16}}>
        <div style={{padding:"8px 14px",borderBottom:`1px solid ${C.border}`,color:C.lime,fontFamily:"monospace",fontSize:9,letterSpacing:2}}>OPEN PULL REQUESTS ({prs.length})</div>
        {prs.map((pr,i)=><div key={i} style={{display:"flex",gap:10,padding:"9px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
          <span style={{color:C.green,minWidth:30}}>#{pr.number}</span>
          <span style={{color:C.text,flex:1}}>{pr.title}</span>
          <a href={pr.html_url} target="_blank" rel="noreferrer" style={{color:C.blue,minWidth:40,textAlign:"right",textDecoration:"none"}}>↗ View</a>
        </div>)}
      </div>}
    </div>}
    {tab==="commits"&&<div style={{background:C.panel,border:`1px solid ${C.border}`}}>
      {commits.map((c,i)=><div key={i} style={{display:"flex",gap:10,padding:"9px 14px",borderBottom:`1px solid ${C.border}`,fontFamily:"monospace",fontSize:10}}>
        <span style={{color:C.muted,minWidth:70}}>{c.sha?.slice(0,7)}</span>
        <span style={{color:C.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.commit?.message?.split("\n")[0]}</span>
        <span style={{color:C.muted,minWidth:80,textAlign:"right"}}>{c.commit?.author?.name}</span>
      </div>)}
      {commits.length===0&&<div style={{padding:20,color:C.muted,fontFamily:"monospace",fontSize:11}}>Load repo data first.</div>}
    </div>}
    {tab==="fix"&&<div>
      {fixCode&&<><div style={{background:"#060606",border:`1px solid ${C.border}`,padding:16,fontFamily:"monospace",fontSize:10,whiteSpace:"pre-wrap",lineHeight:1.7,color:C.text,maxHeight:400,overflowY:"auto",marginBottom:12}}>{fixCode}</div>
        <div style={{display:"flex",gap:10}}><Btn onClick={createPR} variant="green">CREATE PULL REQUEST ↗</Btn><Btn onClick={()=>navigator.clipboard.writeText(fixCode)}>COPY CODE</Btn></div>
      </>}
      {!fixCode&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:11,padding:20}}>Go to Overview → enter an SEO issue → Generate Fix.</div>}
    </div>}
  </div>;
}

// ── REPORTS ───────────────────────────────────────────────────────
function Reports({integrations}) {
  const ai=integrations.ai;
  const [generating,setGenerating]=useState(false);const [report,setReport]=useState("");const [type,setType]=useState("weekly");
  const [domain,setDomain]=useState("");

  const gen=async()=>{
    setGenerating(true);setReport("");
    const context={gsc:integrations.gsc?.connected,ga4:integrations.ga4?.connected,audit:integrations.dataforseo?.connected};
    try{const r=await callAI(ai,`You are Helio, an expert SEO reporting agent. Generate a comprehensive ${type} SEO report. Include: Executive Summary, Key Metrics (with placeholder data), Technical Health, Traffic Overview, Top Performing Pages/Keywords, Issues Found, Actions Taken This Period, Next Steps. Use clear headers (##). Professional, data-driven tone. 400-600 words.`,`Generate a ${type} SEO performance report for: ${domain||"the target website"}. Connected data sources: GSC=${context.gsc}, GA4=${context.ga4}, DataForSEO=${context.audit}.`);setReport(r);}
    catch(e){setReport(`Error: ${e.message}`);}
    setGenerating(false);
  };

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Reports" sub={`AI-generated SEO reports · Weekly & Monthly · AI: ${ai?.fields?.model||"—"}`}/>
    <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:18}}>
      <Input label="Domain / Project Name" value={domain} onChange={setDomain} placeholder="generalizingai.com"/>
      <div>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:9,letterSpacing:1,marginBottom:5}}>REPORT TYPE</div>
        <div style={{display:"flex",gap:0}}>
          {["weekly","monthly","quarterly"].map(t=><div key={t} onClick={()=>setType(t)} style={{flex:1,padding:"8px 0",textAlign:"center",cursor:"pointer",fontFamily:"monospace",fontSize:10,fontWeight:700,background:type===t?C.lime:"#060606",color:type===t?"#000":C.muted,border:`1px solid ${type===t?C.lime:C.dim}`,marginRight:-1}}>{t.toUpperCase()}</div>)}
        </div>
      </div>
      <Btn onClick={gen} disabled={generating}>{generating?"▶ GENERATING REPORT...":"▤ GENERATE SEO REPORT"}</Btn>
    </div>
    {generating&&<div style={{color:C.lime,fontFamily:"monospace",fontSize:11,padding:20}}>Helio is writing your {type} report █</div>}
    {report&&<div>
      <div style={{background:"#060606",border:`1px solid ${C.border}`,padding:20,fontFamily:"monospace",fontSize:11,whiteSpace:"pre-wrap",lineHeight:1.8,color:C.text,maxHeight:600,overflowY:"auto",scrollbarWidth:"thin"}}>{report}</div>
      <div style={{marginTop:12,display:"flex",gap:10}}>
        <Btn onClick={()=>navigator.clipboard.writeText(report)}>COPY REPORT</Btn>
        <Btn onClick={()=>{const b=new Blob([report],{type:"text/plain"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`helio-${type}-report.txt`;a.click();}} variant="blue">DOWNLOAD .TXT</Btn>
      </div>
    </div>}
    {!report&&!generating&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:11,padding:20,background:C.panel,border:`1px solid ${C.border}`}}>Configure report settings above and click Generate. Helio will create a comprehensive SEO performance report using all connected data sources.</div>}
  </div>;
}

// ── TASK MANAGER ──────────────────────────────────────────────────
function Tasks({integrations}) {
  const ai=integrations.ai;
  const [tasks,setTasks]=useState([
    {id:1,status:"todo",priority:"high",module:"Technical",label:"Fix missing canonical tags on 12 pages",due:"2025-06-01"},
    {id:2,status:"in-progress",priority:"high",module:"Content",label:"Write pillar article: Complete Guide to AI Automation",due:"2025-05-28"},
    {id:3,status:"todo",priority:"medium",module:"On-Page",label:"Optimize meta descriptions on 23 pages",due:"2025-06-07"},
    {id:4,status:"done",priority:"low",module:"Technical",label:"Submit updated sitemap to GSC",due:"2025-05-20"},
    {id:5,status:"todo",priority:"high",module:"Backlinks",label:"Reach out to 5 guest post targets",due:"2025-06-10"},
    {id:6,status:"in-progress",priority:"medium",module:"AEO",label:"Add FAQ schema to top 10 blog posts",due:"2025-06-05"},
    {id:7,status:"done",priority:"medium",module:"Technical",label:"Fix 4xx broken pages with redirects",due:"2025-05-18"},
  ]);
  const [generating,setGenerating]=useState(false);const [newTask,setNewTask]=useState("");const [filter,setFilter]=useState("all");const [aiPlan,setAiPlan]=useState("");

  const addTask=()=>{if(!newTask.trim())return;setTasks(p=>[...p,{id:Date.now(),status:"todo",priority:"medium",module:"General",label:newTask,due:""}]);setNewTask("");};
  const updateStatus=(id,status)=>setTasks(p=>p.map(t=>t.id===id?{...t,status}:t));
  const deleteTask=(id)=>setTasks(p=>p.filter(t=>t.id!==id));

  const genAIPlan=async()=>{
    setGenerating(true);setAiPlan("");
    const todoTasks=tasks.filter(t=>t.status!=="done").map(t=>`[${t.priority.toUpperCase()}] ${t.label} (${t.module})`).join("\n");
    try{const r=await callAI(ai,"You are Helio SEO agent. Analyze the task list and provide: 1) Prioritization recommendation, 2) This week's focus (top 3 tasks), 3) Estimated time per task, 4) Dependencies between tasks. Terminal style, concise.",`Current SEO task list:\n${todoTasks}`);setAiPlan(r);}
    catch(e){setAiPlan(`Error: ${e.message}`);}
    setGenerating(false);
  };

  const filtered=filter==="all"?tasks:tasks.filter(t=>t.status===filter);
  const priC=p=>p==="high"?C.red:p==="medium"?C.orange:C.muted;
  const stC=s=>s==="done"?C.green:s==="in-progress"?C.lime:C.muted;
  const stL=s=>s==="done"?"✓ DONE":s==="in-progress"?"▶ ACTIVE":"○ TODO";

  return <div style={{padding:24,overflowY:"auto",flex:1}}>
    <Hdr title="Task Manager" sub={`SEO task queue · AI prioritization · ${tasks.filter(t=>t.status!=="done").length} active tasks`}/>
    <div style={{display:"flex",gap:10,marginBottom:18}}>
      <input value={newTask} onChange={e=>setNewTask(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addTask();}} placeholder="Add new SEO task... (press Enter)"
        style={{flex:1,background:"#060606",border:`1px solid ${C.dim}`,color:C.text,fontFamily:"monospace",fontSize:11,padding:"9px 12px",outline:"none"}}/>
      <Btn onClick={addTask}>ADD TASK</Btn>
      <Btn onClick={genAIPlan} disabled={generating} variant="blue">{generating?"PLANNING...":"◈ AI PRIORITIZE"}</Btn>
    </div>
    <div style={{display:"flex",gap:0,marginBottom:18}}>
      {["all","todo","in-progress","done"].map(f=><div key={f} onClick={()=>setFilter(f)} style={{flex:1,padding:"7px 0",textAlign:"center",cursor:"pointer",fontFamily:"monospace",fontSize:9,fontWeight:700,background:filter===f?C.lime:"#060606",color:filter===f?"#000":C.muted,border:`1px solid ${filter===f?C.lime:C.dim}`,marginRight:-1,textTransform:"uppercase"}}>{f}</div>)}
    </div>
    {aiPlan&&<div style={{background:"#060606",border:`1px solid ${C.borderLime}`,padding:14,marginBottom:18,fontFamily:"monospace",fontSize:11,whiteSpace:"pre-wrap",lineHeight:1.7,color:C.text}}>{aiPlan}</div>}
    <div style={{background:C.panel,border:`1px solid ${C.border}`}}>
      {filtered.map((task,i)=><div key={task.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:`1px solid ${C.border}`}}>
        <span style={{color:stC(task.status),fontFamily:"monospace",fontSize:9,minWidth:62}}>{stL(task.status)}</span>
        <span style={{color:priC(task.priority),fontFamily:"monospace",fontSize:8,minWidth:44,border:`1px solid ${priC(task.priority)}`,padding:"1px 5px",textAlign:"center"}}>{task.priority.toUpperCase()}</span>
        <span style={{color:C.text,fontFamily:"monospace",fontSize:10,flex:1}}>{task.label}</span>
        <span style={{color:C.blue,fontFamily:"monospace",fontSize:8,minWidth:70,border:`1px solid ${C.dim}`,padding:"1px 5px",textAlign:"center"}}>{task.module}</span>
        <select value={task.status} onChange={e=>updateStatus(task.id,e.target.value)} style={{background:"#060606",border:`1px solid ${C.dim}`,color:C.muted,fontFamily:"monospace",fontSize:9,padding:"2px 6px",outline:"none"}}>
          <option value="todo">Todo</option><option value="in-progress">In Progress</option><option value="done">Done</option>
        </select>
        <button onClick={()=>deleteTask(task.id)} style={{background:"transparent",border:"none",color:C.muted,cursor:"pointer",fontFamily:"monospace",fontSize:11,padding:"0 4px"}}>✕</button>
      </div>)}
      {filtered.length===0&&<div style={{padding:20,color:C.muted,fontFamily:"monospace",fontSize:11}}>No tasks in this category.</div>}
    </div>
    <div style={{display:"flex",gap:16,marginTop:14}}>
      {[{label:"Total",count:tasks.length,color:C.muted},{label:"Todo",count:tasks.filter(t=>t.status==="todo").length,color:C.orange},{label:"Active",count:tasks.filter(t=>t.status==="in-progress").length,color:C.lime},{label:"Done",count:tasks.filter(t=>t.status==="done").length,color:C.green}].map((s,i)=><div key={i} style={{fontFamily:"monospace",fontSize:10}}>
        <span style={{color:C.muted}}>{s.label}: </span><span style={{color:s.color,fontWeight:700}}>{s.count}</span>
      </div>)}
    </div>
  </div>;
}

// ── APP SHELL ─────────────────────────────────────────────────────
export default function Helio() {
  const [active,setActive]=useState("integrations");
  const [agentOnline,setAgentOnline]=useState(false);
  const [integrations,setIntegrations]=useState(Object.fromEntries(Object.keys(INTEGRATION_DEFS).map(id=>[id,{connected:false,fields:{}}])));
  const connCount=Object.values(integrations).filter(v=>v.connected).length;

  const renderModule=()=>{
    const missing=(MODULE_REQUIREMENTS[active]||[]).filter(id=>!integrations[id]?.connected);
    if(missing.length>0&&active!=="integrations")return <Gate moduleId={active} integrations={integrations}>{null}</Gate>;
    switch(active){
      case "mission":return <Mission integrations={integrations} agentOnline={agentOnline} setAgentOnline={setAgentOnline}/>;
      case "audit":return <Audit integrations={integrations}/>;
      case "keywords":return <Keywords integrations={integrations}/>;
      case "content":return <Content integrations={integrations}/>;
      case "onpage":return <OnPage integrations={integrations}/>;
      case "backlinks":return <Backlinks integrations={integrations}/>;
      case "gsc":return <GSC integrations={integrations}/>;
      case "analytics":return <Analytics integrations={integrations}/>;
      case "aeo":return <AEO integrations={integrations}/>;
      case "github":return <GitHub integrations={integrations}/>;
      case "reports":return <Reports integrations={integrations}/>;
      case "tasks":return <Tasks integrations={integrations}/>;
      case "integrations":return <Integrations integrations={integrations} setIntegrations={setIntegrations}/>;
      default:return null;
    }
  };

  return <div style={{display:"flex",height:"100vh",background:C.bg,color:C.text,overflow:"hidden"}}>
    <div style={{width:205,background:C.panel,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",flexShrink:0}}>
      <div style={{padding:"20px 16px 12px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{color:C.lime,fontFamily:"monospace",fontSize:22,fontWeight:900,letterSpacing:4}}>HELIO</div>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:8,letterSpacing:2,marginTop:2}}>SEO AGENT v1.0</div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
        {NAV.map(n=>{
          const locked=(MODULE_REQUIREMENTS[n.id]||[]).some(id=>!integrations[id]?.connected)&&n.id!=="integrations";
          return <div key={n.id} onClick={()=>setActive(n.id)} style={{display:"flex",alignItems:"center",gap:9,padding:"8px 16px",cursor:"pointer",background:active===n.id?"#111800":"transparent",borderLeft:active===n.id?`3px solid ${C.lime}`:"3px solid transparent",color:active===n.id?C.lime:locked?C.dim:C.muted,fontFamily:"monospace",fontSize:10,letterSpacing:1}}>
            <span style={{fontSize:12}}>{n.icon}</span><span style={{flex:1}}>{n.label.toUpperCase()}</span>
            {locked&&<span style={{fontSize:9}}>🔒</span>}
          </div>;
        })}
      </div>
      <div style={{padding:12,borderTop:`1px solid ${C.border}`}}>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:8,marginBottom:5}}>INTEGRATIONS</div>
        <div style={{background:C.dim,height:2,marginBottom:5}}><div style={{height:"100%",background:C.lime,width:`${(connCount/Object.keys(INTEGRATION_DEFS).length)*100}%`,transition:"width 0.3s"}}/></div>
        <div style={{color:C.muted,fontFamily:"monospace",fontSize:8}}>{connCount}/{Object.keys(INTEGRATION_DEFS).length} connected</div>
        {integrations.ai?.connected&&<div style={{color:C.muted,fontFamily:"monospace",fontSize:8,marginTop:3}}>AI: <span style={{color:C.lime}}>{integrations.ai.fields.model?.split("/").pop()?.slice(0,18)}</span></div>}
        <div style={{marginTop:8,display:"flex",gap:5,alignItems:"center"}}>
          <div style={{width:5,height:5,borderRadius:"50%",background:agentOnline?C.green:C.red}}/>
          <span style={{color:C.muted,fontFamily:"monospace",fontSize:8}}>{agentOnline?"AGENT ONLINE":"AGENT OFFLINE"}</span>
        </div>
      </div>
    </div>
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 24px",height:44,borderBottom:`1px solid ${C.border}`,background:C.panel,flexShrink:0}}>
        <span style={{color:C.muted,fontFamily:"monospace",fontSize:10,letterSpacing:1}}>{NAV.find(n=>n.id===active)?.label.toUpperCase()}</span>
        <div style={{display:"flex",gap:14,alignItems:"center"}}>
          {integrations.ai?.connected&&<span style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>{AI_PROVIDERS[integrations.ai.fields.provider]?.label} · <span style={{color:C.lime}}>{integrations.ai.fields.model?.split("/").pop()}</span></span>}
          <span style={{color:C.muted,fontFamily:"monospace",fontSize:9}}>{new Date().toLocaleString()}</span>
          <div style={{background:"#111800",border:`1px solid ${C.lime}`,color:C.lime,fontFamily:"monospace",fontSize:9,padding:"2px 10px",letterSpacing:2}}>{agentOnline?"● ONLINE":"○ OFFLINE"}</div>
        </div>
      </div>
      <div style={{flex:1,overflow:"hidden",display:"flex"}}>{renderModule()}</div>
    </div>
  </div>;
}
